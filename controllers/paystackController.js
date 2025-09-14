
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { sendEmail } from '../utils/sendEmail.js';
import { createNotification } from './notificationController.js';
import sanitizeHtml from 'sanitize-html';
import { userModel } from '../models/User.js';
import { orderModel } from '../models/Order.js';
import { TransactionModel } from '../models/Transaction.js';
import mongoose from 'mongoose';
import {
  generateRefundEmail,
  generatePayoutNotificationEmail,
  generateTransactionReversalEmail,
} from '../utils/Templates.js';
import axios from 'axios';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';
const commissionRate = 0.05; // 5% platform commission
const paystack = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
});

// Utility function for retry logic
const withRetry = async (fn, maxRetries, description) => {
  let attempt = 1;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      logger.warn(`${description} attempt ${attempt} failed: ${error.message}`, {
        statusCode: error.response?.status,
        response: error.response?.data,
      });
      if (attempt === maxRetries) throw error;
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
};

// Create Paystack subaccount for a seller
export const createSubaccount = async (req, res) => {
  try {
    const { user, body } = req;
    const { business_name, account_number, bank_code } = body;

    if (!user || !business_name || !account_number || !bank_code) {
      logger.warn('Create subaccount failed: Missing required fields', { userId: user?._id });
      return res.status(400).json({ success: false, message: 'Missing required fields: business_name, account_number, bank_code' });
    }

    const response = await paystack.post('/subaccount', {
      business_name: sanitizeHtml(business_name),
      settlement_bank: bank_code,
      account_number: sanitizeHtml(account_number),
      percentage_charge: commissionRate,
    });

    if (!response.data.status) {
      logger.error(`Create subaccount failed: ${response.data.message}`, { userId: user._id, response: response.data });
      return res.status(500).json({ success: false, message: response.data.message });
    }

    const subaccountCode = response.data.data.subaccount_code;
    await userModel.findByIdAndUpdate(user._id, {
      'personalInfo.subaccount_code': subaccountCode,
      'personalInfo.mobileMoneyDetails': {
        provider: 'M-Pesa',
        phoneNumber: sanitizeHtml(account_number),
        accountName: sanitizeHtml(business_name),
      },
    }, { session: null });

    logger.info(`Subaccount created for user ${user._id}`, { subaccount_code: subaccountCode });
    return res.status(200).json({ success: true, data: { subaccount_code: subaccountCode } });
  } catch (error) {
    logger.error(`Error creating subaccount: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Create Paystack transfer recipient for M-Pesa payouts
export const createTransferRecipient = async (userId) => {
  try {
    const user = await userModel.findById(userId);
    if (!user || !user.personalInfo.mobileMoneyDetails?.phoneNumber) {
      logger.error(`User or M-Pesa details not found`, { userId });
      throw new Error('User or M-Pesa details not found');
    }

    const response = await paystack.post('/transferrecipient', {
      type: 'mobile_money',
      name: sanitizeHtml(user.personalInfo.mobileMoneyDetails.accountName || user.personalInfo.fullname),
      account_number: sanitizeHtml(user.personalInfo.mobileMoneyDetails.phoneNumber),
      bank_code: 'MPS',
      currency: 'KES',
    });

    if (!response.data.status) {
      logger.error(`Create transfer recipient failed: ${response.data.message}`, { userId, response: response.data });
      throw new Error(response.data.message);
    }

    const recipientCode = response.data.data.recipient_code;
    await userModel.findByIdAndUpdate(userId, {
      'personalInfo.recipient_code': recipientCode,
    }, { session: null });

    logger.info(`Transfer recipient created for user ${userId}`, { recipient_code: recipientCode });
    return recipientCode;
  } catch (error) {
    logger.error(`Error creating transfer recipient: ${error.message}`, { stack: error.stack, userId });
    throw error;
  }
};

// Initialize Payment
export const initializePayment = async (orderId, session, email, deliveryFee) => {
  try {
    const order = await orderModel.findById(orderId).session(session).populate('items.sellerId');
    if (!order) {
      logger.error(`Order not found for payment initialization`, { orderId });
      throw new Error('Order not found');
    }
    if (!order.items || !Array.isArray(order.items)) {
      logger.error(`Order items missing or invalid`, { orderId });
      throw new Error('Order items are missing or invalid');
    }

    const itemTotal = order.items
      .filter(item => !item.cancelled)
      .reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (Math.abs(order.totalAmount - (itemTotal + deliveryFee)) > 0.01) {
      logger.error(`Total amount mismatch. Expected ${itemTotal + deliveryFee}, got ${order.totalAmount}`, { orderId });
      throw new Error('Total amount does not match item prices plus delivery fee');
    }

    const subaccountMap = order.items
      .filter(item => !item.cancelled)
      .reduce((acc, item) => {
        const seller = item.sellerId;
        if (!seller || !seller.personalInfo?.subaccount_code) {
          logger.error(`Seller ${item.sellerId} has no subaccount`, { orderId });
          throw new Error(`Seller ${sanitizeHtml(seller.personalInfo?.fullname || item.sellerId)} has no subaccount`);
        }
        const subaccountCode = seller.personalInfo.subaccount_code;
        if (!acc[subaccountCode]) {
          acc[subaccountCode] = { subaccount: subaccountCode, share: 0 };
        }
        const itemShare = (item.price * item.quantity / itemTotal) * (1 - commissionRate) * 100;
        acc[subaccountCode].share += itemShare;
        return acc;
      }, {});

    const subaccounts = Object.values(subaccountMap);
    const totalShare = subaccounts.reduce((sum, sub) => sum + sub.share, 0);
    if (totalShare > 100) {
      logger.error(`Total subaccount share exceeds 100%: ${totalShare}`, { orderId });
      throw new Error('Total subaccount share exceeds 100%');
    }
    if (subaccounts.length === 0) {
      logger.error(`No valid sellers for payment split`, { orderId });
      throw new Error('No valid sellers for payment split');
    }

    const splitConfig = {
      name: `Split for Order #${order.orderId}`,
      type: 'percentage',
      currency: 'KES',
      subaccounts,
      bearer_type: 'account',
      bearer_subaccount: null,
    };

    const response = await paystack.post('/transaction/initialize', {
      email: sanitizeHtml(email),
      amount: Math.round(order.totalAmount * 100), // Convert to kobo
      callback_url: `${FRONTEND_URL}/placed-order/verify`,
      metadata: { orderId: order._id.toString() },
      split: splitConfig,
    });

    if (!response.data.status) {
      logger.error(`Paystack transaction initialization failed: ${response.data.message}`, { orderId, response: response.data });
      throw new Error(response.data.message);
    }

    const paystackFee = order.totalAmount * 0.015;
    const netAmount = order.totalAmount - paystackFee;
    const transaction = new TransactionModel({
      orderId: order._id,
      paystackReference: response.data.data.reference,
      totalAmount: order.totalAmount,
      deliveryFee,
      paystackFee,
      netAmount,
      items: order.items
        .filter(item => !item.cancelled)
        .map(item => {
          const itemAmount = item.price * item.quantity;
          const sellerShare = itemAmount * (1 - commissionRate);
          const platformCommission = itemAmount * commissionRate;
          const transferFee = sellerShare <= 1500 ? 20 : sellerShare <= 20000 ? 40 : 60;
          const netCommission = platformCommission - (itemAmount / itemTotal) * paystackFee;
          return {
            itemId: item._id,
            sellerId: item.sellerId._id,
            subaccountCode: item.sellerId.personalInfo.subaccount_code,
            itemAmount,
            sellerShare,
            platformCommission,
            transferFee,
            netCommission: netCommission > 0 ? netCommission : 0,
            deliveryConfirmed: false,
            refundStatus: 'none',
            returnStatus: 'none',
          };
        }),
    });

    await transaction.save({ session });
    await orderModel.findByIdAndUpdate(orderId, { transactionId: transaction._id }, { session });

    logger.info(`Payment initialized for order ${orderId}`, { reference: response.data.data.reference });
    return {
      error: false,
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference,
    };
  } catch (error) {
    logger.error(`Error initializing payment: ${error.message}`, { stack: error.stack, orderId });
    return { error: true, message: error.message };
  }
};

// Verify Transaction
export const verifyTransaction = async (reference) => {
  const session = await mongoose.startSession();
  let committed = false;
  session.startTransaction();
  try {
    if (!reference || typeof reference !== 'string') {
      logger.error(`Invalid transaction reference`, { reference });
      throw new Error('Invalid transaction reference');
    }

    const existingTransaction = await TransactionModel.findOne({ paystackReference: reference }).session(session);
    if (!existingTransaction) {
      logger.warn(`Transaction not found in database`, { reference });
      throw new Error('Transaction not found in database');
    }

    if (existingTransaction.status === 'completed') {
      logger.info(`Transaction ${reference} already verified`, { reference });
      await session.commitTransaction();
      committed = true;
      return {
        error: false,
        data: {
          status: existingTransaction.status,
          amount: existingTransaction.totalAmount,
          paymentMethod: existingTransaction.paymentMethod,
          paidAt: existingTransaction.paidAt,
        },
      };
    }

    const response = await withRetry(
      () => paystack.get(`/transaction/verify/${encodeURIComponent(reference)}`),
      3,
      `Verify transaction ${reference}`
    );

    if (!response.data.status || response.data.data.status !== 'success') {
      logger.error(`Transaction verification failed: ${response.data.message}`, { reference, response: response.data });
      throw new Error(response.data.message || 'Transaction verification failed');
    }

    const transactionData = response.data.data;
    const orderId = transactionData.metadata.orderId;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      logger.error(`Invalid orderId in transaction metadata`, { reference, orderId });
      throw new Error('Invalid orderId in transaction metadata');
    }

    const transaction = await TransactionModel.findOneAndUpdate(
      { paystackReference: reference },
      {
        status: 'completed',
        paymentMethod: transactionData.channel,
        paidAt: new Date(transactionData.paid_at),
        isReversed: transactionData.status === 'reversed',
      },
      { new: true, session }
    );
    if (!transaction) {
      logger.error(`Transaction not found for update`, { reference, orderId });
      throw new Error('Transaction not found for update');
    }

    const order = await orderModel.findById(orderId).session(session).populate('items.sellerId');
    if (!order) {
      logger.error(`Order not found for transaction`, { reference, orderId });
      throw new Error('Order not found');
    }

    if (order.status !== 'paid') {
      const updatedOrder = await orderModel.findByIdAndUpdate(
        orderId,
        { status: 'paid', transactionId: transaction._id },
        { new: true, session }
      );
      if (!updatedOrder) {
        logger.error(`Order update returned null`, { reference, orderId });
        throw new Error('Order update failed');
      }
      logger.info(`Order ${orderId} status updated to paid`, { reference });
    } else {
      logger.info(`Order ${orderId} already marked as paid`, { reference });
    }

    for (const transactionItem of transaction.items) {
      const itemAmount = transactionItem.itemAmount;
      const sellerShare = itemAmount * (1 - parseFloat(process.env.COMMISSION_RATE || 0.045));
      await userModel.findByIdAndUpdate(
        transactionItem.sellerId,
        {
          $inc: { 'financials.balance': sellerShare },
          $push: {
            'financials.payoutHistory': {
              amount: sellerShare,
              method: 'M-Pesa',
              paystackTransferCode: null,
              status: 'pending',
              orderId: order._id,
              itemId: transactionItem.itemId,
            },
          },
        },
        { session }
      );
      logger.info(`Seller ${transactionItem.sellerId} balance updated: +KES ${sellerShare} (pending)`, { orderId, itemId: transactionItem.itemId });
    }

    const platformCommission = transaction.items.reduce((sum, item) => sum + item.platformCommission, 0);
    const platformBalance = platformCommission + transaction.deliveryFee;
    await userModel.findOneAndUpdate(
      { 'personalInfo.isAdmin': true },
      { $inc: { 'financials.balance': platformBalance } },
      { session }
    );
    logger.info(`Admin balance updated: +KES ${platformBalance} (commission + delivery fee)`, { orderId });

    await session.commitTransaction();
    committed = true;
    logger.info(`Transaction verified successfully`, { reference, orderId, orderStatus: order.status });

    return {
      error: false,
      data: {
        status: 'completed',
        amount: transactionData.amount / 100,
        paymentMethod: transactionData.channel,
        paidAt: transactionData.paid_at,
      },
    };
  } catch (error) {
    if (!committed) {
      await session.abortTransaction();
      logger.info(`Transaction aborted for verification`, { reference });
    }
    logger.error(`Error verifying transaction: ${error.message}`, { stack: error.stack, reference });
    return { error: true, message: error.message };
  } finally {
    session.endSession();
  }
};

// Verify Transactions Endpoint
export const verifyTransactions = async (req, res) => {
  try {
    const { reference } = req.params;
    if (!reference) {
      logger.error(`No reference provided in verify request`, { query: req.query });
      return res.status(400).json({ error: true, message: 'Reference is required' });
    }

    const result = await verifyTransaction(reference);
    if (result.error) {
      return res.status(400).json({ error: true, message: result.message });
    }

    logger.info(`Transaction verified successfully via endpoint`, { reference });
    return res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    logger.error(`Error in verifyTransactions endpoint: ${error.message}`, { stack: error.stack, reference: req.params.reference });
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Initiate Refund
export const initiateRefund = async (orderId, itemId, session) => {
  try {
    logger.info("Started the refund process", { orderId, itemId });
    const order = await orderModel.findById(orderId).session(session).populate('items.sellerId customerId');
    const transaction = await TransactionModel.findOne({ orderId }).session(session);
    if (!order || !transaction) {
      logger.error(`Order or transaction not found for refund`, { orderId, itemId });
      throw new Error('Order or transaction not found');
    }

    const item = order.items.find(i => i.productId === itemId);
    if (!item) {
      logger.error(`Item not found or not cancelled`, { orderId, itemId });
      throw new Error('Item not found or not cancelled');
    }

    const transactionItem = transaction.items.find(i => i.itemId.toString() === item._id.toString());
    if (!transactionItem) {
      logger.error(`Transaction item not found`, { orderId, itemId });
      throw new Error('Transaction item not found');
    }

    if (transactionItem.refundStatus !== 'none') {
      logger.warn(`Refund already processed or in progress for item`, { orderId, itemId, refundStatus: transactionItem.refundStatus });
      return { error: false, message: `Refund already ${transactionItem.refundStatus}` };
    }

    let verifyResponse;
    try {
      verifyResponse = await paystack.get(`/transaction/verify/${encodeURIComponent(transaction.paystackReference)}`);
      logger.debug(`Paystack verification response`, {
        orderId,
        itemId,
        reference: transaction.paystackReference,
        status: verifyResponse.data.status,
        transactionStatus: verifyResponse.data.data?.status,
        message: verifyResponse.data.message,
      });
    } catch (error) {
      logger.error(`Paystack verification request failed`, {
        orderId,
        itemId,
        reference: transaction.paystackReference,
        error: error.message,
        statusCode: error.response?.status,
        response: error.response?.data,
      });
      throw new Error(`Transaction verification failed: ${error.response?.data?.message || error.message}`);
    }

    const transactionStatus = verifyResponse.data.data.status;
    logger.debug(`Transaction status for refund: ${transactionStatus}`, { orderId, itemId, reference: transaction.paystackReference });

    if (transactionStatus === 'reversed') {
      logger.warn(`Transaction ${transaction.paystackReference} is reversed, marking item as refunded`, { orderId, itemId });
      transactionItem.refundStatus = 'completed';
      transactionItem.refundedAmount = transactionItem.itemAmount;
      transaction.isReversed = true;
      await transaction.save({ session });

      if (order.status !== 'cancelled') {
        order.status = 'cancelled';
        order.totalAmount = 0;
        order.items.forEach(i => {
          i.status = 'cancelled';
          i.cancelled = true;
          i.refundStatus = 'completed';
          i.refundedAmount = i.price * i.quantity;
        });
        await order.save({ session });
      }

      const sellerShare = transactionItem.sellerShare;
      await userModel.findByIdAndUpdate(
        transactionItem.sellerId,
        {
          $inc: { 'financials.balance': -sellerShare },
          $push: {
            'financials.payoutHistory': {
              amount: -sellerShare,
              method: 'M-Pesa',
              paystackTransferCode: null,
              status: 'refunded',
              orderId,
              itemId: transactionItem.itemId,
            },
          },
        },
        { session }
      );
      logger.info(`Seller ${transactionItem.sellerId} balance updated: -KES ${sellerShare} (refund)`, { orderId, itemId });

      const platformCommission = transactionItem.platformCommission;
      await userModel.findOneAndUpdate(
        { 'personalInfo.isAdmin': true },
        { $inc: { 'financials.balance': -platformCommission } },
        { session }
      );
      logger.info(`Admin balance updated: -KES ${platformCommission} (refund)`, { orderId, itemId });

      const admins = await userModel.find({ 'personalInfo.isAdmin': true }).session(session);
      for (const admin of admins) {
        const adminNotificationReq = {
          user: { _id: admin._id, personalInfo: admin.personalInfo || {} },
          body: {
            userId: admin._id.toString(),
            sender: transactionItem.sellerId.toString(),
            type: 'transaction_reversal',
            content: `Transaction ${transaction.paystackReference} for order ${orderId} is reversed, affecting item ${itemId}. Please investigate.`,
          },
        };
        await createNotification(adminNotificationReq, {
          status: () => ({
            json: data => {
              if (!data.success) {
                logger.warn(`Failed to create admin reversal notification: ${data.message}`, { orderId, itemId });
              } else {
                logger.info(`Admin reversal notification created for admin ${admin._id}`, { orderId, itemId, notificationId: data.data?._id });
              }
            },
          }),
        });
      }

      return { error: false, message: 'Transaction already reversed, marked as refunded' };
    }

    if (transactionStatus !== 'success') {
      logger.error(`Transaction not in a refundable state`, {
        orderId,
        itemId,
        reference: transaction.paystackReference,
        status: transactionStatus,
        message: verifyResponse.data.message,
      });
      return { error: true, message: `Transaction is not in a refundable state: ${transactionStatus}` };
    }

    if (transaction.status === 'completed' && order.status !== 'paid') {
      logger.info(`Syncing order ${orderId} status to paid before refund`, { orderId, itemId });
      order.status = 'paid';
      await order.save({ session });
    }

    const refundAmount = Math.round(transactionItem.itemAmount * 100);
    if (refundAmount <= 0) {
      logger.error(`Invalid refund amount`, { orderId, itemId, refundAmount });
      throw new Error('Invalid refund amount');
    }

    const totalTransactionAmount = verifyResponse.data.data.amount;
    const alreadyRefundedAmount = transaction.items.reduce((sum, item) => sum + (item.refundedAmount || 0) * 100, 0);
    if (alreadyRefundedAmount + refundAmount > totalTransactionAmount) {
      logger.error(`Refund amount exceeds remaining transaction balance`, {
        orderId,
        itemId,
        refundAmount,
        alreadyRefundedAmount,
        totalTransactionAmount,
      });
      throw new Error('Refund amount exceeds remaining transaction balance');
    }

    const nonCancelledItems = order.items.filter(i => !i.cancelled && i.productId !== itemId);
    const isFullRefund = nonCancelledItems.length === 0;

    const refundPayload = {
      transaction: transaction.paystackReference,
      amount: isFullRefund ? totalTransactionAmount : refundAmount,
      description: isFullRefund
        ? `Full refund for Order #${order.orderId} due to all items cancelled`
        : `Partial refund for cancelled item ${sanitizeHtml(item.name)} in Order #${order.orderId}`,
    };

    const refundResponse = await withRetry(
      () => paystack.post('/refund', refundPayload),
      3,
      `Initiate refund for order ${orderId}, item ${itemId}`
    );

    if (!refundResponse.data.status) {
      logger.error(`Paystack refund initiation failed`, {
        orderId,
        itemId,
        message: refundResponse.data.message,
        statusCode: refundResponse.status,
      });
      throw new Error(refundResponse.data.message || `Refund failed with status code ${refundResponse.status}`);
    }

    transactionItem.refundStatus = 'pending';
    transactionItem.refundedAmount = transactionItem.itemAmount;
    transaction.isReversed = isFullRefund;
    item.refundStatus = 'pending';
    item.refundedAmount = transactionItem.itemAmount;
    await transaction.save({ session });
    await order.save({ session });

    const sellerShare = transactionItem.sellerShare;
    await userModel.findByIdAndUpdate(
      transactionItem.sellerId,
      {
        $inc: { 'financials.balance': -sellerShare },
        $push: {
          'financials.payoutHistory': {
            amount: -sellerShare,
            method: 'M-Pesa',
            paystackTransferCode: refundResponse.data.data?.transaction?.reference || null,
            status: 'refunded',
            orderId,
            itemId: transactionItem.itemId,
          },
        },
      },
      { session }
    );
    logger.info(`Seller ${transactionItem.sellerId} balance updated: -KES ${sellerShare} (refund)`, { orderId, itemId });

    const platformCommission = transactionItem.platformCommission;
    await userModel.findOneAndUpdate(
      { 'personalInfo.isAdmin': true },
      { $inc: { 'financials.balance': -platformCommission } },
      { session }
    );
    logger.info(`Admin balance updated: -KES ${platformCommission} (refund)`, { orderId, itemId });

    const buyer = order.customerId;
    if (buyer && buyer.personalInfo?.email) {
      const emailContent = generateRefundEmail(
        buyer.personalInfo.fullname || 'Customer',
        item.name,
        order.orderId,
        transactionItem.itemAmount,
        isFullRefund,
        'buyer',
        transactionItem.sellerId.toString()
      );
      const emailSent = await sendEmail(
        buyer.personalInfo.email,
        'Refund Initiated - BeiFity.Com',
        emailContent
      );
      if (!emailSent) {
        logger.warn(`Failed to send refund email to buyer ${buyer._id}`, { orderId, itemId });
      } else {
        logger.info(`Refund email sent to buyer ${buyer._id}`, { orderId, itemId });
      }
    }

    const buyerNotificationReq = {
      user: { _id: buyer._id, personalInfo: buyer.personalInfo || {} },
      body: {
        userId: buyer._id.toString(),
        sender: transactionItem.sellerId.toString(),
        type: 'refund',
        content: `A ${isFullRefund ? 'full' : 'partial'} refund of KES ${transactionItem.itemAmount.toFixed(2)} for item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(order.orderId)}) has been initiated.`,
      },
    };
    await createNotification(buyerNotificationReq, {
      status: () => ({
        json: data => {
          if (!data.success) {
            logger.warn(`Failed to create refund notification for buyer ${buyer._id}: ${data.message}`, { orderId, itemId });
          } else {
            logger.info(`Refund notification created for buyer ${buyer._id}`, { orderId, itemId, notificationId: data.data?._id });
          }
        },
      }),
    });

    const seller = item.sellerId;
    if (seller && seller.personalInfo?.email) {
      const sellerEmailContent = generateRefundEmail(
        seller.personalInfo.fullname || 'Seller',
        item.name,
        order.orderId,
        transactionItem.itemAmount,
        isFullRefund,
        'seller',
        buyer._id.toString()
      );
      const sellerEmailSent = await sendEmail(
        seller.personalInfo.email,
        'Order Item Refund Notification - BeiFity.Com',
        sellerEmailContent
      );
      if (!sellerEmailSent) {
        logger.warn(`Failed to send refund email to seller ${seller._id}`, { orderId, itemId });
      } else {
        logger.info(`Refund email sent to seller ${seller._id}`, { orderId, itemId });
      }
    }

    const sellerNotificationReq = {
      user: { _id: seller._id, personalInfo: seller.personalInfo || {} },
      body: {
        userId: seller._id.toString(),
        sender: buyer._id.toString(),
        type: 'refund',
        content: `The buyer cancelled item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(order.orderId)}). KES ${sellerShare.toFixed(2)} has been deducted from your pending balance as part of the ${isFullRefund ? 'full' : 'partial'} refund.`,
      },
    };
    await createNotification(sellerNotificationReq, {
      status: () => ({
        json: data => {
          if (!data.success) {
            logger.warn(`Failed to create refund notification for seller ${seller._id}: ${data.message}`, { orderId, itemId });
          } else {
            logger.info(`Refund notification created for seller ${seller._id}`, { orderId, itemId, notificationId: data.data?._id });
          }
        },
      }),
    });

    return { error: false, message: `Refund initiated successfully (${isFullRefund ? 'full' : 'partial'})` };
  } catch (error) {
    logger.error(`Error initiating refund: ${error.message}`, { stack: error.stack, orderId, itemId });
    return { error: true, message: error.message };
  }
};

// Initiate Payout
export const initiatePayout = async (transactionId, itemId, session) => {
  try {
    const transaction = await TransactionModel.findById(transactionId).session(session);
    if (!transaction) {
      logger.error(`Transaction not found for payout`, { transactionId, itemId });
      throw new Error('Transaction not found');
    }

    const order = await orderModel.findById(transaction.orderId).session(session).populate('items.sellerId');
    if (!order) {
      logger.error(`Order not found for payout`, { transactionId, itemId });
      throw new Error('Order not found');
    }

    const transactionItem = transaction.items.find(i => i.itemId.toString() === itemId.toString());
    if (!transactionItem) {
      logger.error(`Transaction item not found for payout`, { transactionId, itemId });
      throw new Error('Transaction item not found');
    }

    if (transactionItem.payoutStatus !== 'pending') {
      logger.warn(`Payout already processed or in progress`, { transactionId, itemId, payoutStatus: transactionItem.payoutStatus });
      return { error: false, message: `Payout already ${transactionItem.payoutStatus}` };
    }

    const sellerId = transactionItem.sellerId.toString();
    const seller = await userModel.findById(sellerId).session(session);
    if (!seller) {
      logger.error(`Seller not found for payout`, { transactionId, itemId, sellerId });
      throw new Error('Seller not found');
    }

    let recipientCode = seller.personalInfo.recipient_code;
    if (!recipientCode) {
      recipientCode = await createTransferRecipient(seller._id);
      logger.info(`Created new recipient code for seller ${seller._id}`, { recipientCode });
    }

    const sellerItems = transaction.items.filter(
      i => i.sellerId.toString() === sellerId && i.payoutStatus === 'pending' && order.items.find(oi => oi._id.toString() === i.itemId.toString()).status === 'delivered'
    );
    const totalPayoutAmount = sellerItems.reduce((sum, item) => {
      const payoutAmount = item.sellerShare - item.transferFee;
      return sum + (payoutAmount > 0 ? payoutAmount : 0);
    }, 0);

    if (totalPayoutAmount <= 0) {
      logger.error(`Invalid total payout amount`, { transactionId, sellerId, totalPayoutAmount });
      throw new Error('Invalid total payout amount');
    }

    if (seller.financials.balance < totalPayoutAmount) {
      logger.error(`Insufficient balance for payout`, { sellerId, balance: seller.financials.balance, required: totalPayoutAmount });
      throw new Error('Insufficient seller balance for payout');
    }

    const response = await withRetry(
      () =>
        paystack.post('/transfer', {
          source: 'balance',
          amount: Math.round(totalPayoutAmount * 100),
          recipient: recipientCode,
          reason: `Payout for items in Order #${transaction.orderId}`,
        }),
      3,
      `Initiate payout for seller ${sellerId} in transaction ${transactionId}`
    );

    if (!response.data.status) {
      logger.error(`Paystack payout initiation failed`, { transactionId, sellerId, message: response.data.message });
      throw new Error(response.data.message);
    }

    for (const item of sellerItems) {
      item.payoutStatus = 'pending';
      item.paystackTransferCode = response.data.data.transfer_code;
    }
    await transaction.save({ session });

    await userModel.findByIdAndUpdate(
      sellerId,
      {
        $inc: { 'financials.balance': -totalPayoutAmount },
        $push: {
          'financials.payoutHistory': {
            amount: totalPayoutAmount,
            method: 'M-Pesa',
            paystackTransferCode: response.data.data.transfer_code,
            status: 'pending',
            orderId: transaction.orderId,
            itemId: sellerItems.map(i => i.itemId),
          },
        },
      },
      { session }
    );

    if (seller && seller.personalInfo?.email) {
      const emailContent = generatePayoutNotificationEmail(
        seller.personalInfo.fullname || 'Seller',
        transaction.orderId,
        totalPayoutAmount,
        sellerItems.map(i => i.itemId.toString()),
        response.data.data.transfer_code
      );
      const emailSent = await sendEmail(
        seller.personalInfo.email,
        'Payout Initiated - BeiFity.Com',
        emailContent
      );
      if (!emailSent) {
        logger.warn(`Failed to send payout notification email to seller ${seller._id}`, { transactionId, itemId });
      } else {
        logger.info(`Payout notification email sent to seller ${seller._id}`, { transactionId, itemId });
      }
    }

    const sellerNotificationReq = {
      user: { _id: seller._id, personalInfo: seller.personalInfo || {} },
      body: {
        userId: seller._id.toString(),
        sender: 'system',
        type: 'payout',
        content: `A payout of KES ${totalPayoutAmount.toFixed(2)} for items in Order ID: ${sanitizeHtml(transaction.orderId)} has been initiated to your M-Pesa account.`,
      },
    };
    await createNotification(sellerNotificationReq, {
      status: () => ({
        json: data => {
          if (!data.success) {
            logger.warn(`Failed to create payout notification for seller ${seller._id}: ${data.message}`, { transactionId, itemId });
          } else {
            logger.info(`Payout notification created for seller ${seller._id}`, { transactionId, itemId, notificationId: data.data?._id });
          }
        },
      }),
    });

    logger.info(`Payout initiated for seller ${transactionItem.sellerId}: KES ${totalPayoutAmount}`, { transactionId, itemId });
    return { error: false, message: 'Payout initiated successfully' };
  } catch (error) {
    logger.error(`Error initiating payout: ${error.message}`, { stack: error.stack, transactionId, itemId });
    return { error: true, message: error.message };
  }
};

// Handle Paystack Webhook
export const handlePaystackWebhook = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionCommitted = false;
  session.startTransaction();
  try {
    const { event, data } = req.body;

    if (event === 'refund.processed') {
      const transaction = await TransactionModel.findOne({ paystackReference: data.transaction.reference }).session(session);
      if (!transaction) {
        logger.warn(`Webhook refund.processed: Transaction not found for reference ${data.transaction.reference}`);
        return res.status(404).json({ success: false, message: 'Transaction not found' });
      }

      const order = await orderModel.findById(transaction.orderId).session(session).populate('items.sellerId customerId');
      if (!order) {
        logger.warn(`Webhook refund.processed: Order not found for transaction ${data.transaction.reference}`);
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const item = order.items.find(i => i._id.toString() === data.metadata.itemId);
      if (item) {
        item.refundStatus = 'completed';
        item.refundedAmount = data.amount / 100;
        await order.save({ session });
      }

      const transactionItem = transaction.items.find(tItem => tItem.itemId.toString() === data.metadata.itemId);
      if (transactionItem) {
        transactionItem.refundStatus = 'completed';
        transactionItem.refundedAmount = data.amount / 100;
        await transaction.save({ session });
      }

      const buyer = order.customerId;
      if (buyer && buyer.personalInfo?.email) {
        const emailContent = generateRefundEmail(
          buyer.personalInfo.fullname || 'Customer',
          item.name,
          order.orderId,
          transactionItem.itemAmount,
          order.items.every(i => i.refundStatus === 'completed'),
          'buyer',
          transactionItem.sellerId.toString()
        );
        const emailSent = await sendEmail(
          buyer.personalInfo.email,
          'Refund Completed - BeiFity.Com',
          emailContent
        );
        if (!emailSent) {
          logger.warn(`Failed to send refund completion email to buyer ${buyer._id}`, { orderId: transaction.orderId, itemId: data.metadata.itemId });
        } else {
          logger.info(`Refund completion email sent to buyer ${buyer._id}`, { orderId: transaction.orderId, itemId: data.metadata.itemId });
        }
      }

      const seller = item?.sellerId;
      if (seller && seller.personalInfo?.email) {
        const sellerEmailContent = generateRefundEmail(
          seller.personalInfo.fullname || 'Seller',
          item.name,
          order.orderId,
          transactionItem.itemAmount,
          order.items.every(i => i.refundStatus === 'completed'),
          'seller',
          buyer._id.toString()
        );
        const sellerEmailSent = await sendEmail(
          seller.personalInfo.email,
          'Order Item Refund Completed - BeiFity.Com',
          sellerEmailContent
        );
        if (!sellerEmailSent) {
          logger.warn(`Failed to send refund completion email to seller ${seller._id}`, { orderId: transaction.orderId, itemId: data.metadata.itemId });
        } else {
          logger.info(`Refund completion email sent to seller ${seller._id}`, { orderId: transaction.orderId, itemId: data.metadata.itemId });
        }
      }

      await session.commitTransaction();
      transactionCommitted = true;
      logger.info(`Refund processed for item ${data.metadata.itemId} in order ${order.orderId}`);
      return res.status(200).json({ success: true, message: 'Refund processed' });
    }

    if (event === 'charge.reversed') {
      const transaction = await TransactionModel.findOne({ paystackReference: data.transaction.reference }).session(session);
      if (!transaction) {
        logger.warn(`Webhook charge.reversed: Transaction not found for reference ${data.transaction.reference}`);
        return res.status(404).json({ success: false, message: 'Transaction not found' });
      }

      const order = await orderModel.findById(transaction.orderId).session(session).populate('items.sellerId customerId');
      if (!order) {
        logger.warn(`Webhook charge.reversed: Order not found for transaction ${data.transaction.reference}`);
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      transaction.isReversed = true;
      transaction.status = 'failed';
      const itemIds = transaction.items.map(tItem => tItem.itemId.toString());
      transaction.items.forEach(tItem => {
        tItem.refundStatus = 'completed';
        tItem.refundedAmount = tItem.itemAmount;
      });

      order.status = 'cancelled';
      order.totalAmount = 0;
      order.items.forEach(item => {
        item.status = 'cancelled';
        item.cancelled = true;
        item.refundStatus = 'completed';
        item.refundedAmount = item.price * item.quantity;
      });
      await order.save({ session });
      await transaction.save({ session });

      const buyer = order.customerId;
      if (buyer && buyer.personalInfo?.email) {
        const buyerEmailContent = generateTransactionReversalEmail(
          buyer.personalInfo.fullname || 'Customer',
          order.orderId,
          itemIds,
          'buyer',
          order.items[0].sellerId.toString()
        );
        const buyerEmailSent = await sendEmail(
          buyer.personalInfo.email,
          'Transaction Reversed - BeiFity.Com',
          buyerEmailContent
        );
        if (!buyerEmailSent) {
          logger.warn(`Failed to send transaction reversal email to buyer ${buyer._id}`, { orderId: transaction.orderId });
        } else {
          logger.info(`Transaction reversal email sent to buyer ${buyer._id}`, { orderId: transaction.orderId });
        }
      }

      const sellerIds = [...new Set(order.items.map(i => i.sellerId._id.toString()))];
      for (const sellerId of sellerIds) {
        const seller = await userModel.findById(sellerId).session(session);
        if (seller && seller.personalInfo?.email) {
          const sellerEmailContent = generateTransactionReversalEmail(
            seller.personalInfo.fullname || 'Seller',
            order.orderId,
            itemIds,
            'seller',
            buyer._id.toString()
          );
          const sellerEmailSent = await sendEmail(
            seller.personalInfo.email,
            'Transaction Reversed Notification - BeiFity.Com',
            sellerEmailContent
          );
          if (!sellerEmailSent) {
            logger.warn(`Failed to send transaction reversal email to seller ${seller._id}`, { orderId: transaction.orderId });
          } else {
            logger.info(`Transaction reversal email sent to seller ${seller._id}`, { orderId: transaction.orderId });
          }
        }
      }

      await session.commitTransaction();
      transactionCommitted = true;
      logger.info(`Transaction reversed for order ${order.orderId}`);
      return res.status(200).json({ success: true, message: 'Transaction reversed' });
    }

    await session.commitTransaction();
    transactionCommitted = true;
    return res.status(200).json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    if (!transactionCommitted) {
      await session.abortTransaction();
    }
    logger.error(`Webhook error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: `Webhook error: ${error.message}` });
  } finally {
    session.endSession();
  }
};