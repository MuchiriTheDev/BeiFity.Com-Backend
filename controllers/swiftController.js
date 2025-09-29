import crypto from 'crypto';
import logger from '../utils/logger.js';
import { sendEmail } from '../utils/sendEmail.js';
import sanitizeHtml from 'sanitize-html';
import { userModel } from '../models/User.js';
import { orderModel } from '../models/Order.js';
import { TransactionModel } from '../models/Transaction.js';
import mongoose from 'mongoose';
import {
  generateRefundEmail,
  generatePayoutNotificationEmail,
  generateTransactionReversalEmail,
  generateOrderEmailBuyer,
  generateOrderEmailSeller,
} from '../utils/Templates.js';
import axios from 'axios';
import { platform } from 'os';
import { sendNotification } from './notificationController.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';
const commissionRate = 0.05; // 5% platform commission
const swift = axios.create({
  baseURL: process.env.SWIFT_BASE_URL || 'https://swiftwallet.co.ke/pay-app-v2/',
  headers: { 
    'Authorization': `Bearer ${process.env.SWIFT_API_KEY}`,
    'Content-Type': 'application/json',
  },
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

// Initialize Payment (SWIFT STK Push)
export const initializePayment = async (orderId, session, email, deliveryFee) => {
  try {
    const order = await orderModel.findById(orderId).session(session).populate('customerId', 'personalInfo.phone personalInfo.mobileMoneyDetails');
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

    // Get buyer's phone for STK Push
    let buyerPhone = order.customerId.personalInfo.mobileMoneyDetails?.phoneNumber || order.customerId.personalInfo.phone;
    if (!buyerPhone) {
      logger.error(`Buyer phone not found for payment`, { orderId, customerId: order.customerId._id });
      throw new Error('Buyer phone number required for M-Pesa payment');
    }
    // Format to Kenyan standard (254XXXXXXXXX)
    if (buyerPhone.startsWith('0')) buyerPhone = '254' + buyerPhone.slice(1);
    else if (buyerPhone.startsWith('+254')) buyerPhone = `0${buyerPhone.slice(4)}`;
    console.log(buyerPhone)
    
    // Create Transaction (pre-save hook calculates shares/owed)
    const transaction = new TransactionModel({
      orderId: order.orderId,
      totalAmount: order.totalAmount,
      deliveryFee,
      swiftReference:'1',
      swiftServiceFee: 0, // Placeholder; from webhook
      netReceived: order.totalAmount, // Placeholder
      items: order.items
        .filter(item => !item.cancelled)
        .map(item => ({
          itemId: item._id,
          sellerId: item.sellerId._id,
          itemAmount: item.price * item.quantity,
          platformCommission: 0, // Placeholder; calculated in pre-save
          netCommission: 0, // Placeholder; calculated in pre-save
          sellerShare: item.price * item.quantity, // Placeholder; calculated in pre-
          owedAmount: item.price * item.quantity, // Placeholder; calculated in pre-save
          
        })),
      status: 'swift_initiated',
      paymentMethod: 'M-Pesa',
    });

    // Link to Order
    await orderModel.findByIdAndUpdate(orderId, { swiftTransactionId: transaction._id }, { session });

    // Call SWIFT API for STK Push
    const swiftPayload = {
      amount: Math.round(order.totalAmount), // Int KES, min 1
      phone_number: buyerPhone,
      channel_id: process.env.SWIFT_CHANNEL_ID || undefined, // Optional
      account_reference: `ORDER-${orderId}`,
      transaction_desc: `Payment for Order #${order.orderId}`,
      callback_url: `${process.env.DOMAIN}/api/payments/webhook/swift`, // Your webhook endpoint
    };
    

    const response = await withRetry(
      () => swift.post('/payments.php', swiftPayload),
      3,
      `Initialize SWIFT payment for order ${orderId}`
    );

    const swiftData = response.data;
    console.log('SWIFT Init Response:', swiftData);
    if (!swiftData.success) {
      // Rollback
      await transaction.deleteOne({ session });
      await orderModel.findByIdAndUpdate(orderId, { $unset: { swiftTransactionId: '' } }, { session });
      logger.error(`SWIFT payment initialization failed: ${swiftData.message}`, { orderId, response: swiftData });
      throw new Error(swiftData.message || 'Payment initiation failed');
    }

    transaction.swiftReference = swiftData?.reference || transaction.swiftReference;
    await transaction.save({ session });


    await transaction.save({ session });

    logger.info(`SWIFT payment initialized for order ${orderId}`, { swiftReference: transaction.swiftReference });
    return {
      error: false,
      authorization_url: null, // No URL; STK Push to phone
      reference: transaction.swiftReference,
    };
  } catch (error) {
    logger.error(`Error initializing payment: ${error.message}`, { stack: error.stack, orderId });
    return { error: true, message: error.message };
  }
};

// Verify Transaction (for polling; real confirmation via webhook)
export const verifyTransaction = async (reference) => {
  const session = await mongoose.startSession();
  let committed = false;
  session.startTransaction();
  try {
    if (!reference || typeof reference !== 'string') {
      logger.error(`Invalid transaction reference`, { reference });
      throw new Error('Invalid transaction reference');
    }

    const existingTransaction = await TransactionModel.findOne({ swiftReference: reference }).session(session);
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

    // For SWIFT, no direct verify—poll status or wait for webhook. Here, check if webhook processed.
    // If not 'completed', return pending.
    if (existingTransaction.status !== 'completed') {
      logger.info(`Transaction ${reference} still pending`, { reference, currentStatus: existingTransaction.status });
      return {
        error: false,
        data: {
          status: 'pending',
          amount: existingTransaction.totalAmount,
          paymentMethod: existingTransaction.paymentMethod,
          paidAt: null,
        },
      };
    }

    await session.commitTransaction();
    committed = true;
    logger.info(`Transaction verified successfully (via poll)`, { reference });
    return {
      error: false,
      data: {
        status: 'completed',
        amount: existingTransaction.totalAmount,
        paymentMethod: existingTransaction.paymentMethod,
        paidAt: existingTransaction.paidAt,
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

// Initiate Refund (Manual - no API)
export const initiateRefund = async (orderId, itemId, session) => {
  try {
    logger.info("Started the manual refund process", { orderId, itemId });
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

    // Manual: Mark as pending, deduct balances, notify "as soon as possible"
    transactionItem.refundStatus = 'pending';
    transactionItem.refundedAmount = transactionItem.itemAmount;
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
            status: 'manual_refund_pending',
          },
        },
      },
      { session }
    );
    logger.info(`Seller ${transactionItem.sellerId} balance updated: -KES ${sellerShare} (manual refund pending)`, { orderId, itemId });

    const platformCommission = transactionItem.platformCommission;
    await userModel.findOneAndUpdate(
      { 'personalInfo.isAdmin': true },
      { $inc: { 'financials.balance': -platformCommission } },
      { session }
    );
    logger.info(`Admin balance updated: -KES ${platformCommission} (manual refund)`, { orderId, itemId });

    const isFullRefund = order.items.every(i => i.refundStatus === 'pending' || i.refundStatus === 'completed');
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
        emailContent.replace('has been initiated', 'has been initiated manually and will be processed as soon as possible')
      );
      if (!emailSent) {
        logger.warn(`Failed to send refund email to buyer ${buyer._id}`, { orderId, itemId });
      } else {
        logger.info(`Manual refund email sent to buyer ${buyer._id}`, { orderId, itemId });
      }
    }

    const buyerNotificationContent = `A ${isFullRefund ? 'full' : 'partial'} refund of KES ${transactionItem.itemAmount.toFixed(2)} for item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(order.orderId)}) has been initiated manually and will be processed as soon as possible.`;
    try {
      await sendNotification(
        buyer._id.toString(),
        'refund',
        buyerNotificationContent,
        transactionItem.sellerId.toString(),
        session
      );
      logger.info(`Manual refund notification created for buyer ${buyer._id}`, { orderId, itemId });
    } catch (notificationError) {
      logger.warn(`Failed to create refund notification for buyer ${buyer._id}: ${notificationError.message}`, { orderId, itemId });
    }

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
        sellerEmailContent.replace('has been initiated', 'has been initiated manually and will be processed as soon as possible')
      );
      if (!sellerEmailSent) {
        logger.warn(`Failed to send refund email to seller ${seller._id}`, { orderId, itemId });
      } else {
        logger.info(`Manual refund email sent to seller ${seller._id}`, { orderId, itemId });
      }
    }

    const sellerNotificationContent = `The buyer cancelled item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(order.orderId)}). KES ${sellerShare.toFixed(2)} has been deducted from your pending balance as part of the ${isFullRefund ? 'full' : 'partial'} manual refund, which will be processed as soon as possible.`;
    try {
      await sendNotification(
        seller._id.toString(),
        'refund',
        sellerNotificationContent,
        buyer._id.toString(),
        session
      );
      logger.info(`Manual refund notification created for seller ${seller._id}`, { orderId, itemId });
    } catch (notificationError) {
      logger.warn(`Failed to create refund notification for seller ${seller._id}: ${notificationError.message}`, { orderId, itemId });
    }

    return { error: false, message: `Manual refund initiated successfully (${isFullRefund ? 'full' : 'partial'}). Will be processed as soon as possible.` };
  } catch (error) {
    logger.error(`Error initiating manual refund: ${error.message}`, { stack: error.stack, orderId, itemId });
    return { error: true, message: error.message };
  }
};

// Initiate Payout (Manual - no API)
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

    if (transactionItem.payoutStatus !== 'manual_pending') {
      logger.warn(`Payout already processed or in progress`, { transactionId, itemId, payoutStatus: transactionItem.payoutStatus });
      return { error: false, message: `Payout already ${transactionItem.payoutStatus}` };
    }

    const sellerId = transactionItem.sellerId.toString();
    const seller = await userModel.findById(sellerId).session(session);
    if (!seller) {
      logger.error(`Seller not found for payout`, { transactionId, itemId, sellerId });
      throw new Error('Seller not found');
    }

    const sellerItems = transaction.items.filter(
      i => i.sellerId.toString() === sellerId && i.payoutStatus === 'manual_pending' && order.items.find(oi => oi._id.toString() === i.itemId.toString()).status === 'delivered'
    );
    const totalPayoutAmount = sellerItems.reduce((sum, item) => sum + item.owedAmount, 0);

    if (totalPayoutAmount <= 0) {
      logger.error(`Invalid total payout amount`, { transactionId, sellerId, totalPayoutAmount });
      throw new Error('Invalid total payout amount');
    }

    if (seller.financials.balance < totalPayoutAmount) {
      logger.error(`Insufficient balance for payout`, { sellerId, balance: seller.financials.balance, required: totalPayoutAmount });
      throw new Error('Insufficient seller balance for payout');
    }

    // Manual: Mark as transferred, update balances
    for (const item of sellerItems) {
      item.payoutStatus = 'transferred';
      item.swiftPayoutReference = `MANUAL-${Date.now()}-${sellerId}`; // Track manual
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
            swiftTransferId: `MANUAL-${Date.now()}-${sellerId}`,
            status: 'completed',
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
        `MANUAL-${Date.now()}-${sellerId}`
      );
      const emailSent = await sendEmail(
        seller.personalInfo.email,
        'Payout Processed - BeiFity.Com',
        emailContent.replace('Initiated', 'Processed Manually')
      );
      if (!emailSent) {
        logger.warn(`Failed to send payout notification email to seller ${seller._id}`, { transactionId, itemId });
      } else {
        logger.info(`Manual payout email sent to seller ${seller._id}`, { transactionId, itemId });
      }
    }

    const sellerNotificationContent = `A manual payout of KES ${totalPayoutAmount.toFixed(2)} for items in Order ID: ${sanitizeHtml(transaction.orderId)} has been processed to your M-Pesa account.`;
    try {
      await sendNotification(
        seller._id.toString(),
        'payout',
        sellerNotificationContent,
        'system',
        session
      );
      logger.info(`Manual payout notification created for seller ${seller._id}`, { transactionId, itemId });
    } catch (notificationError) {
      logger.warn(`Failed to create payout notification for seller ${seller._id}: ${notificationError.message}`, { transactionId, itemId });
    }

    logger.info(`Manual payout processed for seller ${transactionItem.sellerId}: KES ${totalPayoutAmount}`, { transactionId, itemId });
    return { error: false, message: 'Manual payout processed successfully' };
  } catch (error) {
    logger.error(`Error initiating manual payout: ${error.message}`, { stack: error.stack, transactionId, itemId });
    return { error: true, message: error.message };
  }
};

// {
//   success: true,
//   transaction_id: 5496,
//   external_reference: 'INV-68da799130778',
//   checkout_request_id: 'ws_CO_29092025152034401114672193',
//   merchant_request_id: 'dc8a-4e1e-8306-658886b0d6d8935298',
//   status: 'completed',
//   timestamp: '2025-09-29T15:20:55+03:00',
//   service_fee: 0,
//   result: {
//     ResultCode: 0,
//     ResultDesc: 'The service request is processed successfully.',
//     Amount: 10,
//     MpesaReceiptNumber: 'TIT2J62SDV',
//     Phone: 254114672193,
//     TransactionDate: 20250929152054
//   },
//   channel_info: {
//     channel_type: 'wallet',
//     channel_name: "Muchiri's Payment Wallet",
//     routing_description: 'STK Push to 0114672193 -> Wallet payment via collection channel (ID: 19) to wallet: WALLET-PAYMENT-00000061'
//   }
// }
// Modified handleSwiftWebhook function
export const handleSwiftWebhook = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionCommitted = false;
  session.startTransaction();
  console.log('Received SWIFT webhook:', req.body);
  try {
    const input = req.body;
    const signature = req.headers['x-swiftwallet-signature'];

    // Verify HMAC signature
    const webhookSecret = process.env.SWIFT_WEBHOOK_SECRET;
    if (webhookSecret) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(input))
        .digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(signature || ''), Buffer.from(expectedSignature))) {
        logger.warn('Invalid webhook signature', { reference: input.transaction_id });
        return res.status(401).send('Unauthorized');
      }
    }

    const { transaction_id, external_reference, status, service_fee, result } = input;

    if (!transaction_id || status !== 'completed' || result.ResultCode !== 0) {
      logger.warn(`Webhook invalid: status=${status}, code=${result.ResultCode}`, { transaction_id });
      await session.commitTransaction();
      transactionCommitted = true;
      return res.status(200).send('OK'); // ACK anyway
    }
    console.log('Processing SWIFT webhook for transaction:', external_reference);
    const transaction = await TransactionModel.findOne({ swiftReference: external_reference }).session(session);
    if (!transaction) {
      logger.warn(`Webhook: Transaction not found for ${transaction_id}`);
      await session.commitTransaction();
      transactionCommitted = true;
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const order = await orderModel.findOne({orderId : transaction.orderId}).session(session).populate('items.sellerId customerId');
    if (!order) {
      logger.warn(`Webhook: Order not found for transaction ${transaction_id}`);
      await session.commitTransaction();
      transactionCommitted = true;
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    

    // Update Transaction
    transaction.status = 'completed';
    transaction.swiftServiceFee = service_fee || (transaction.totalAmount * parseFloat(process.env.SWIFT_FEE_RATE || 0.02));
    transaction.netReceived = transaction.totalAmount - transaction.swiftServiceFee;
    transaction.paidAt = new Date();
    await transaction.save({ session });

    // Update Order to paid
    if (order.status !== 'paid') {
      order.status = 'paid';
      await order.save({ session });
      logger.info(`Order ${order.orderId} status updated to paid via webhook`, { transaction_id });
    }

    // Update seller balances (no auto-payout; just record)
    for (const transactionItem of transaction.items) {
      const itemAmount = transactionItem.itemAmount;
      const sellerShare = itemAmount * (1 - commissionRate);
      await userModel.findByIdAndUpdate(
        transactionItem.sellerId,
        {
          $inc: { 'financials.balance': sellerShare },
          $push: {
            'financials.payoutHistory': {
              amount: sellerShare,
              method: 'M-Pesa',
              status: 'manual_pending',
              
            },
          },
        },
        { session }
      );
      logger.info(`Seller ${transactionItem.sellerId} balance updated: +KES ${sellerShare} (manual pending)`, { orderid: order.orderId, itemId: transactionItem.itemId });
    }

    // Platform commission + delivery
    const platformCommission = transaction.items.reduce((sum, item) => sum + item.platformCommission, 0);
    const platformBalance = platformCommission + transaction.deliveryFee;
    await userModel.findOneAndUpdate(
      { 'personalInfo.isAdmin': true },
      { $inc: { 'financials.balance': platformBalance } },
      { session }
    );
    logger.info(`Admin balance updated: +KES ${platformBalance} (commission + delivery fee)`, { orderId: order.orderId });

    await session.commitTransaction();
    transactionCommitted = true;
    logger.info(`SWIFT webhook processed successfully`, { transaction_id, orderId: order._id });

    // Full order confirmations and notifications (post-commit)
    const buyer = order.customerId;
    const orderTime = order.createdAt.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
    const totalOrderPrice = order.totalAmount;
    const buyerName = sanitizeHtml(buyer.personalInfo?.fullname || 'Buyer');

    // Buyer: Full order confirmation email and notification (payment confirmed)
    if (buyer.preferences?.emailNotifications) {
      await withRetry(async () => {
        const buyerEmailContent = generateOrderEmailBuyer(
          buyerName,
          order.items,
          orderTime,
          totalOrderPrice,
          order.deliveryAddress,
          order.orderId,
          [...new Set(order.items.map(item => item.sellerId.toString()))],
          null // No URL for STK Push
        ).replace('has been placed', 'payment has been confirmed and is now processing'); // Adjust template content for confirmation
        const buyerEmailSent = await sendEmail(buyer.personalInfo.email, 'Order Confirmed - BeiFity.Com', buyerEmailContent);
        if (!buyerEmailSent) throw new Error('Failed to send buyer confirmation email');
        logger.info(`Order confirmation email sent to buyer ${buyer._id}`, { orderId: order.orderId });
      }, 3, `Send buyer confirmation email for order ${order.orderId}`);
    } else {
      logger.info(`Buyer ${buyer._id} has email notifications disabled`, { orderId: order.orderId });
    }
    console.log("Buyer id", buyer._id.toString());
    const buyerNotificationContent = `Your payment for Order ID: ${sanitizeHtml(order.orderId)} (KES ${totalOrderPrice}) has been confirmed. Processing will begin soon.`;
    try {
      await sendNotification(
        buyer._id.toString(),
        'order',
        buyerNotificationContent,
        null
      );
      logger.info(`Order confirmation notification created for buyer ${buyer._id}`, { orderId: order.orderId });
    } catch (notificationError) {
      logger.warn(`Failed to create buyer confirmation notification: ${notificationError.message}`, { orderId: order.orderId });
    }

// Sellers: New order emails and notifications (payment confirmed)
const sellerItemsMap = new Map();
order.items.forEach(item => {
  // Get the actual seller ID string, not the populated object
  const sellerId = item.sellerId._id ? item.sellerId._id.toString() : item.sellerId.toString();
  if (!sellerItemsMap.has(sellerId)) sellerItemsMap.set(sellerId, []);
  sellerItemsMap.get(sellerId).push(item);
});

for (const [sellerId, items] of sellerItemsMap) {
  console.log('Notifying seller with ID:', sellerId); // Debug log
  const seller = await userModel.findById(sellerId).session(session);
  if (!seller || !seller.personalInfo?.email) {
    logger.warn(`Failed to notify seller ${sellerId}: Seller not found or no email`, { orderId: order.orderId });
    continue;
  }

  if (seller.preferences?.emailNotifications) {
    await withRetry(async () => {
      const sellerName = sanitizeHtml(seller.personalInfo.fullname || 'Seller');
      const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const sellerEmailContent = generateOrderEmailSeller(
        sellerName,
        buyerName,
        items,
        orderTime,
        order.deliveryAddress,
        totalPrice,
        buyer._id,
        order.orderId,
        null // No URL; payment via M-Pesa
      ).replace('You have a new order', 'Payment confirmed for your new order');
      const sellerEmailSent = await sendEmail(seller.personalInfo.email, 'New Order Confirmed - BeiFity.Com', sellerEmailContent);
      if (!sellerEmailSent) throw new Error('Failed to send seller confirmation email');
      logger.info(`Order confirmation email sent to seller ${sellerId}`, { orderId: order.orderId });
    }, 3, `Send seller confirmation email for order ${order.orderId} to seller ${sellerId}`);
  } else {
    logger.info(`Seller ${sellerId} has email notifications disabled`, { orderId: order.orderId });
  }

  const sellerNotificationContent = `Payment confirmed for Order ID: ${sanitizeHtml(order.orderId)}. Your share (KES ${(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * (1 - commissionRate)).toFixed(2)} est.) is pending manual payout after delivery for items: ${items.map(i => sanitizeHtml(i.name)).join(', ')}.`;
  try {
    await sendNotification(
      sellerId, // This should now be the string ID
      'order',
      sellerNotificationContent,
      buyer._id.toString()
    );
    logger.info(`Order confirmation notification created for seller ${sellerId}`, { orderId: order.orderId });
  } catch (notificationError) {
    logger.warn(`Failed to create seller confirmation notification: ${notificationError.message}`, { orderId: order.orderId, sellerId });
  }
}

    // Admins: New paid order notifications and emails
    const admins = await userModel.find({ 'personalInfo.isAdmin': true }).select('_id personalInfo.email personalInfo.fullname preferences').session(session);
    for (const admin of admins) {
      const adminNotificationContent = `A new order (ID: ${order.orderId}) has been placed and paid by ${buyerName} for a total of KES ${totalOrderPrice}.`;
      try {
        await sendNotification(
          admin._id.toString(),
          'order',
          adminNotificationContent,
          buyer._id.toString()
        );
        logger.info(`Order confirmation notification created for admin ${admin._id}`, { orderId: order.orderId });
      } catch (notificationError) {
        logger.warn(`Failed to create admin confirmation notification: ${notificationError.message}`, { orderId: order.orderId, adminId: admin._id });
      }

      if (admin.personalInfo?.email && admin.preferences?.emailNotifications) {
        await withRetry(async () => {
          const adminEmailContent = generateOrderEmailAdmin(
            buyerName,
            order.items,
            orderTime,
            totalOrderPrice,
            order.deliveryAddress,
            order.orderId,
            buyer._id
          ).replace('has been placed', 'has been paid and confirmed'); // Adjust template for confirmation
          const adminEmailSent = await sendEmail(admin.personalInfo.email, 'New Order Confirmed - BeiFity.Com Admin Notification', adminEmailContent);
          if (!adminEmailSent) throw new Error('Failed to send admin confirmation email');
          logger.info(`Order confirmation email sent to admin ${admin._id}`, { orderId: order.orderId });
        }, 3, `Send admin confirmation email for order ${order.orderId} to admin ${admin._id}`);
      } else {
        logger.info(`Admin ${admin._id} has email notifications disabled or no email`, { orderId: order.orderId });
      }
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing SWIFT webhook:', error);
    if (!transactionCommitted) {
      await session.abortTransaction();
    }
    logger.error(`SWIFT webhook error: ${error.message}`, { stack: error.stack });
    return res.status(500).send('Internal Server Error');
  } finally {
    session.endSession();
  }
};