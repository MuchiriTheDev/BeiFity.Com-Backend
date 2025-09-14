import { userModel } from '../models/User.js';
import { orderModel } from '../models/Order.js';
import { listingModel } from '../models/Listing.js';
import { TransactionModel } from '../models/Transaction.js';
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import validator from 'validator';
import logger from '../utils/logger.js';
import { sendEmail } from '../utils/sendEmail.js';
import { createNotification } from './notificationController.js';
import { initializePayment, createSubaccount, initiatePayout, initiateRefund } from './paystackController.js';
import {
  generateOrderEmailAdmin,
  generateOrderEmailBuyer,
  generateOrderEmailSeller,
  generateOrderStatusEmail,
  generateOrderCancellationEmail,
  generateOrderStatusEmailAdmin,
  generateOrderCancellationEmailAdmin,
} from '../utils/Templates.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';
const commissionRate = 0.05; // 5% platform commission
const SESSION_TIMEOUT = 30000; // 30 seconds timeout for Mongoose sessions

// Utility function for retries
const withRetry = async (fn, maxRetries = 3, operationName = 'operation') => {
  let attempt = 1;
  while (attempt <= maxRetries) {
    try {
      const result = await fn();
      logger.debug(`${operationName} succeeded on attempt ${attempt}`);
      return result;
    } catch (error) {
      logger.warn(`${operationName} failed on attempt ${attempt}: ${error.message}`, { stack: error.stack });
      if (attempt === maxRetries) {
        logger.error(`${operationName} failed after ${maxRetries} attempts`, { error: error.message });
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      attempt++;
    }
  }
};

/**
 * Place Order
 * @route POST /api/orders/place-order
 * @desc Create a new order and initiate payment
 * @access Private (requires JWT token)
 */
export const placeOrder = async (req, res) => {
  const session = await mongoose.startSession({ defaultTransactionOptions: { timeout: SESSION_TIMEOUT } });
  let transactionCommitted = false;
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Place order failed: No user data in request', { ip: req.ip });
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { customerId, totalAmount, items, deliveryAddress, deliveryFee } = req.body;
    const requesterId = req.user._id.toString();

    if (requesterId !== customerId) {
      logger.warn(`Place order failed: User ${requesterId} attempted to order as ${customerId}`, { ip: req.ip });
      return res.status(403).json({ success: false, message: 'Unauthorized to place order for this customer' });
    }

    const requiredFields = ['customerId', 'totalAmount', 'items', 'deliveryAddress', 'deliveryFee'];
    for (const field of requiredFields) {
      if (!req.body[field] && req.body[field] !== 0) {
        logger.warn(`Place order failed: Missing required field ${field}`, { userId: requesterId, ip: req.ip });
        return res.status(400).json({ success: false, message: `Missing required field: ${field}` });
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      logger.warn('Place order failed: Empty items array', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Your cart is empty. Please add items to place an order' });
    }

    if (typeof deliveryFee !== 'number' || deliveryFee < 0) {
      logger.warn(`Place order failed: Invalid deliveryFee ${deliveryFee}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Delivery fee must be a non-negative number' });
    }

    const itemRequiredFields = ['sellerId', 'quantity', 'name', 'productId', 'color', 'price'];
    for (const item of items) {
      for (const field of itemRequiredFields) {
        if (!item[field]) {
          logger.warn(`Place order failed: Missing item field ${field}`, { userId: requesterId, productId: item.productId, ip: req.ip });
          return res.status(400).json({ success: false, message: `Missing required item field: ${field}` });
        }
      }
      if (typeof item.quantity !== 'number' || item.quantity < 1) {
        logger.warn(`Place order failed: Invalid quantity ${item.quantity}`, { userId: requesterId, productId: item.productId, ip: req.ip });
        return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
      }
      if (typeof item.price !== 'number' || item.price <= 0) {
        logger.warn(`Place order failed: Invalid price ${item.price}`, { userId: requesterId, productId: item.productId, ip: req.ip });
        return res.status(400).json({ success: false, message: 'Price must be a positive number' });
      }
    }

    const deliveryRequiredFields = ['county', 'constituency', 'nearestTown', 'phone'];
    for (const field of deliveryRequiredFields) {
      if (!deliveryAddress[field]) {
        logger.warn(`Place order failed: Missing delivery address field ${field}`, { userId: requesterId, ip: req.ip });
        return res.status(400).json({ success: false, message: `Missing required delivery address field: ${field}` });
      }
    }
    if (!/^\+?254[0-9]{9}$/.test(deliveryAddress.phone)) {
      logger.warn('Place order failed: Invalid phone', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Valid Kenyan phone number required in delivery address' });
    }

    const calculatedTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0) + deliveryFee;
    if (Math.abs(totalAmount - calculatedTotal) > 0.01) {
      logger.warn(`Place order failed: Total amount mismatch. Expected ${calculatedTotal}, got ${totalAmount}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Total amount does not match item prices plus delivery fee' });
    }

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      logger.warn(`Place order failed: Invalid customerId ${customerId}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Invalid customerId' });
    }

    const user = await userModel.findById(customerId).session(session);
    if (!user) {
      logger.warn(`Place order failed: Customer ${customerId} not found`, { userId: requesterId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    if (!user.personalInfo.email || !validator.isEmail(user.personalInfo.email)) {
      logger.warn('Place order failed: Invalid or missing user email', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Valid user email required for payment' });
    }

    for (const item of items) {
      if (!mongoose.Types.ObjectId.isValid(item.sellerId)) {
        logger.warn(`Place order failed: Invalid sellerId ${item.sellerId}`, { userId: requesterId, productId: item.productId, ip: req.ip });
        return res.status(400).json({ success: false, message: `Invalid sellerId: ${item.sellerId}` });
      }
      const seller = await userModel.findById(item.sellerId).session(session);
      if (!seller) {
        logger.warn(`Place order failed: Seller ${item.sellerId} not found`, { userId: requesterId, productId: item.productId, ip: req.ip });
        return res.status(404).json({ success: false, message: `Seller ${item.sellerId} not found` });
      }

      if (!seller.personalInfo.subaccount_code) {
        let subaccountData;
        let phoneNumber;
        if (seller.personalInfo.mobileMoneyDetails?.phoneNumber) {
          phoneNumber = seller.personalInfo.mobileMoneyDetails.phoneNumber;
        } else {
          if (!seller.personalInfo.fullname || !seller.personalInfo.phone) {
            logger.warn(`Place order failed: Seller ${item.sellerId} missing fullname or phone`, { userId: requesterId, productId: item.productId, ip: req.ip });
            return res.status(400).json({ success: false, message: `Seller ${item.sellerId} missing required fullname or phone for M-Pesa` });
          }
          phoneNumber = seller.personalInfo.phone;
        }

        if (phoneNumber.startsWith('254')) {
          phoneNumber = '0' + phoneNumber.slice(3);
        } else if (phoneNumber.startsWith('+254')) {
          phoneNumber = '0' + phoneNumber.slice(4);
        }

        if (!/^0[0-9]{9}$/.test(phoneNumber)) {
          logger.warn(`Invalid phone number format for subaccount: ${phoneNumber}`, { sellerId: item.sellerId, ip: req.ip });
          return res.status(400).json({ success: false, message: `Invalid phone number format for seller ${item.sellerId}` });
        }

        subaccountData = {
          business_name: sanitizeHtml(seller.personalInfo.mobileMoneyDetails?.accountName || seller.personalInfo.fullname || 'Seller'),
          account_number: sanitizeHtml(phoneNumber),
          bank_code: '231',
        };

        try {
          const subaccountReq = { user: { _id: seller._id, personalInfo: seller.personalInfo }, body: subaccountData };
          const subaccountResult = await withRetry(() => createSubaccount(subaccountReq, {
            status: () => ({
              json: async data => {
                if (!data.success) {
                  logger.error(`Subaccount creation failed: ${data.message || 'No error message provided'}`, { subaccountData, sellerId: item.sellerId, ip: req.ip });
                  throw new Error(data.message || 'Failed to create subaccount');
                }
                return data;
              },
            }),
          }), 3, `Create subaccount for seller ${item.sellerId}`);
          seller.personalInfo.subaccount_code = subaccountResult.data.subaccount_code;
          await seller.save({ session });
          logger.info(`Subaccount created for seller ${item.sellerId}`, { subaccount_code: subaccountResult.data.subaccount_code });
        } catch (subaccountError) {
          logger.error(`Failed to create subaccount for seller ${item.sellerId} after retries`, { error: subaccountError.message, subaccountData, ip: req.ip });
          throw new Error(`Failed to create subaccount for seller ${item.sellerId}: ${subaccountError.message}`);
        }
      }
    }

    const listings = new Map();
    for (const item of items) {
      const listing = await listingModel.findOne({
        'productInfo.productId': item.productId,
        verified: 'Verified',
        isSold: false,
        inventory: { $gte: item.quantity },
      }).session(session);

      if (!listing) {
        logger.warn(`Place order failed: Listing ${item.productId} not found, not verified, sold, or insufficient inventory`, { userId: requesterId, ip: req.ip });
        return res.status(400).json({ success: false, message: `Listing not available for productId: ${item.productId}` });
      }

      const updatedListing = await listingModel.findOneAndUpdate(
        { 'productInfo.productId': item.productId, verified: 'Verified', isSold: false, inventory: { $gte: item.quantity } },
        {
          $inc: { inventory: -item.quantity, 'analytics.ordersNumber': 1 },
          $set: { isSold: listing.inventory - item.quantity <= 0 },
        },
        { session, new: true }
      );

      if (!updatedListing) {
        logger.warn(`Place order failed: Failed to update listing ${item.productId}`, { userId: requesterId, ip: req.ip });
        return res.status(400).json({ success: false, message: `Failed to update listing for productId: ${item.productId}` });
      }

      listings.set(item.productId, updatedListing);
    }

    const orderData = {
      orderId: new mongoose.Types.ObjectId().toString(),
      customerId: new mongoose.Types.ObjectId(customerId),
      totalAmount,
      deliveryFee,
      status: 'pending',
      items: items.map(item => ({
        sellerId: new mongoose.Types.ObjectId(item.sellerId),
        quantity: item.quantity,
        name: sanitizeHtml(item.name),
        productId: sanitizeHtml(item.productId),
        color: sanitizeHtml(item.color),
        price: item.price,
        size: item.size ? sanitizeHtml(item.size) : undefined,
        status: 'pending',
        cancelled: false,
      })),
      deliveryAddress: {
        country: sanitizeHtml(deliveryAddress.country || 'Kenya'),
        county: sanitizeHtml(deliveryAddress.county),
        constituency: sanitizeHtml(deliveryAddress.constituency),
        nearestTown: sanitizeHtml(deliveryAddress.nearestTown),
        phone: sanitizeHtml(deliveryAddress.phone),
      },
    };

    const newOrder = new orderModel(orderData);
    const savedOrder = await newOrder.save({ session });
    logger.debug(`Saved order`, { orderId: savedOrder.orderId });

    const paymentResult = await withRetry(() => initializePayment(savedOrder._id, session, user.personalInfo.email, deliveryFee), 3, `Initialize payment for order ${savedOrder.orderId}`);
    if (paymentResult.error) {
      logger.warn(`Place order failed: Payment initialization failed - ${paymentResult.message}`, { userId: requesterId, orderId: savedOrder.orderId });
      throw new Error(paymentResult.message);
    }

    await userModel.updateOne(
      { _id: user._id },
      { $push: { orders: savedOrder._id }, $inc: { 'stats.pendingOrdersCount': 1, 'analytics.orderCount': 1 } },
      { session }
    );

    for (const item of items) {
      await userModel.updateOne(
        { _id: item.sellerId },
        { $inc: { 'stats.pendingOrdersCount': 1 } },
        { session }
      );
    }

    await session.commitTransaction();
    transactionCommitted = true;
    logger.info(`Transaction committed for order ${savedOrder.orderId}`, { userId: requesterId });

    const sellerItemsMap = new Map();
    savedOrder.items.forEach(item => {
      const sellerId = item.sellerId.toString();
      if (!sellerItemsMap.has(sellerId)) sellerItemsMap.set(sellerId, []);
      sellerItemsMap.get(sellerId).push(item);
    });

    const buyerName = sanitizeHtml(user.personalInfo?.fullname || 'Buyer');
    const orderTime = savedOrder.createdAt.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
    const totalOrderPrice = savedOrder.totalAmount;

    if (user.preferences?.emailNotifications) {
      await withRetry(async () => {
        const buyerEmailContent = generateOrderEmailBuyer(
          buyerName,
          savedOrder.items,
          orderTime,
          totalOrderPrice,
          savedOrder.deliveryAddress,
          savedOrder.orderId,
          [...new Set(savedOrder.items.map(item => item.sellerId.toString()))],
          paymentResult.authorization_url
        );
        const buyerEmailSent = await sendEmail(user.personalInfo.email, 'Your Order Confirmation - BeiFity.Com', buyerEmailContent);
        if (!buyerEmailSent) throw new Error('Failed to send buyer email');
        logger.info(`Order confirmation email sent to buyer ${customerId}`, { orderId: savedOrder.orderId });
      }, 3, `Send buyer email for order ${savedOrder.orderId}`);
    } else {
      logger.info(`Buyer ${customerId} has email notifications disabled`, { orderId: savedOrder.orderId });
    }

    await withRetry(async () => {
      const buyerNotificationReq = {
        user: { _id: customerId, personalInfo: user.personalInfo || {} },
        body: { userId: customerId, sender: customerId, type: 'order', content: `Your order (ID: ${savedOrder.orderId}) has been placed. Complete payment to proceed.` },
      };
      await createNotification(buyerNotificationReq, {
        status: () => ({
          json: data => {
            if (!data.success) throw new Error(`Failed to create buyer notification: ${data.message}`);
            logger.info(`Order notification created for buyer ${customerId}`, { orderId: savedOrder.orderId, notificationId: data.data?._id });
          },
        }),
      });
    }, 3, `Create buyer notification for order ${savedOrder.orderId}`);

    for (const [sellerId, items] of sellerItemsMap) {
      const seller = await userModel.findById(sellerId).session(session);
      if (!seller || !seller.personalInfo?.email) {
        logger.warn(`Failed to notify seller ${sellerId}: Seller not found or no email`, { orderId: savedOrder.orderId });
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
            savedOrder.deliveryAddress,
            totalPrice,
            customerId,
            savedOrder.orderId,
            paymentResult.authorization_url
          );
          const sellerEmailSent = await sendEmail(seller.personalInfo.email, 'New Order for Your Product(s) - BeiFity.Com', sellerEmailContent);
          if (!sellerEmailSent) throw new Error('Failed to send seller email');
          logger.info(`Order email sent to seller ${sellerId}`, { orderId: savedOrder.orderId });
        }, 3, `Send seller email for order ${savedOrder.orderId} to seller ${sellerId}`);
      } else {
        logger.info(`Seller ${sellerId} has email notifications disabled`, { orderId: savedOrder.orderId });
      }

      await withRetry(async () => {
        const sellerNotificationReq = {
          user: { _id: sellerId, personalInfo: seller.personalInfo || {} },
          body: { userId: sellerId, sender: customerId, type: 'order', content: `You have a new order (ID: ${savedOrder.orderId}) for ${items.map(i => sanitizeHtml(i.name)).join(', ')}. Wait for payment confirmation.` },
        };
        await createNotification(sellerNotificationReq, {
          status: () => ({
            json: data => {
              if (!data.success) logger.warn(`Failed to create seller notification: ${data.message}`, { orderId: savedOrder.orderId, sellerId });
              logger.info(`Order notification created for seller ${sellerId}`, { orderId: savedOrder.orderId, notificationId: data.data?._id });
            },
          }),
        });
      }, 3, `Create seller notification for order ${savedOrder.orderId} to seller ${sellerId}`);
    }

    const admins = await userModel.find({ 'personalInfo.isAdmin': true }).select('_id personalInfo.email personalInfo.fullname preferences').session(session);
    for (const admin of admins) {
      await withRetry(async () => {
        const adminNotificationReq = {
          user: { _id: admin._id, personalInfo: admin.personalInfo || {} },
          body: {
            userId: admin._id.toString(),
            sender: customerId,
            type: 'order',
            content: `A new order (ID: ${savedOrder.orderId}) has been placed by ${buyerName} for a total of KES ${totalOrderPrice}. Payment is pending.`,
          },
        };
        await createNotification(adminNotificationReq, {
          status: () => ({
            json: data => {
              if (!data.success) throw new Error(`Failed to create admin notification: ${data.message}`);
              logger.info(`Order notification created for admin ${admin._id}`, { orderId: savedOrder.orderId, notificationId: data.data?._id });
            },
          }),
        });
      }, 3, `Create admin notification for order ${savedOrder.orderId} to admin ${admin._id}`);

      if (admin.personalInfo?.email && admin.preferences?.emailNotifications) {
        await withRetry(async () => {
          const adminEmailContent = generateOrderEmailAdmin(
            buyerName,
            savedOrder.items,
            orderTime,
            totalOrderPrice,
            savedOrder.deliveryAddress,
            savedOrder.orderId,
            customerId
          );
          const adminEmailSent = await sendEmail(admin.personalInfo.email, 'New Order Placed - BeiFity.Com Admin Notification', adminEmailContent);
          if (!adminEmailSent) throw new Error('Failed to send admin email');
          logger.info(`Order email sent to admin ${admin._id}`, { orderId: savedOrder.orderId });
        }, 3, `Send admin email for order ${savedOrder.orderId} to admin ${admin._id}`);
      } else {
        logger.info(`Admin ${admin._id} has email notifications disabled or no email`, { orderId: savedOrder.orderId });
      }
    }

    logger.info(`Order placed successfully: ${savedOrder.orderId} by user ${requesterId}`);
    res.status(201).json({
      success: true,
      message: 'Order placed successfully. Complete payment to proceed.',
      data: { order: savedOrder, authorization_url: paymentResult.authorization_url, reference: paymentResult.reference },
    });
  } catch (error) {
    if (!transactionCommitted) {
      await session.abortTransaction();
      logger.info(`Transaction aborted for order attempt`, { userId: req.user?._id });
    }
    logger.error(`Error placing order: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  } finally {
    session.endSession();
  }
};

/**
 * Update Order Status
 * @route PATCH /api/orders/update-status
 * @desc Update the status of an order item (processing, shipped, out_for_delivery, or delivered)
 * @access Private (requires JWT token)
 */
export const updateOrderStatus = async (req, res) => {
  const session = await mongoose.startSession({ defaultTransactionOptions: { timeout: SESSION_TIMEOUT } });
  let transactionCommitted = false;
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Update order status failed: No user data in request', { ip: req.ip });
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { orderId, itemIndex, status, sellerId, userId, productId } = req.body;
    const requesterId = req.user._id.toString();

    if (!orderId || itemIndex === undefined || !status || !sellerId || !userId || !productId) {
      logger.warn('Update order status failed: Missing required fields', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Missing required fields: orderId, itemIndex, status, sellerId, userId, productId' });
    }

    if (requesterId !== userId) {
      logger.warn(`Update order status failed: User ${requesterId} attempted to update as ${userId}`, { ip: req.ip });
      return res.status(403).json({ success: false, message: 'Unauthorized to update this order' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(sellerId)) {
      logger.warn(`Update order status failed: Invalid userId ${userId} or sellerId ${sellerId}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Invalid userId or sellerId' });
    }

    const order = await orderModel.findOne({ orderId }).session(session).populate('items.sellerId customerId');
    if (!order) {
      logger.warn(`Update order status failed: Order ${orderId} not found`, { userId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.items[itemIndex];
    if (!item) {
      logger.warn(`Update order status failed: Item at index ${itemIndex} not found in order ${orderId}`, { userId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Item not found in order' });
    }
    if (item.cancelled) {
      logger.warn(`Update order status failed: Item ${itemIndex} is cancelled`, { userId, orderId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Cannot update status of a cancelled item' });
    }

    if (item.sellerId.toString() !== sellerId) {
      logger.warn(`Update order status failed: Seller ${sellerId} does not match item seller`, { userId, orderId, itemIndex, ip: req.ip });
      return res.status(403).json({ success: false, message: 'Seller does not match item seller' });
    }

    if (item.productId !== productId) {
      logger.warn(`Update order status failed: ProductId ${productId} does not match item productId`, { userId, orderId, itemIndex, ip: req.ip });
      return res.status(400).json({ success: false, message: 'ProductId does not match item productId' });
    }

    const validStatuses = ['processing', 'shipped', 'out_for_delivery', 'delivered'];
    if (!validStatuses.includes(status)) {
      logger.warn(`Update order status failed: Invalid status ${status}`, { userId, orderId, itemIndex, ip: req.ip });
      return res.status(400).json({ success: false, message: `Invalid status. Use one of ${validStatuses.join(', ')}` });
    }

    const statusFlow = {
      pending: ['processing'],
      processing: ['shipped'],
      shipped: ['out_for_delivery'],
      out_for_delivery: ['delivered'],
      delivered: [],
    };
    if (!statusFlow[item.status]?.includes(status)) {
      logger.warn(`Update order status failed: Cannot transition from ${item.status} to ${status}`, { userId, orderId, itemIndex, ip: req.ip });
      return res.status(400).json({ success: false, message: `Cannot transition from ${item.status} to ${status}` });
    }

    if (['processing', 'shipped', 'out_for_delivery'].includes(status) && item.sellerId.toString() !== userId) {
      logger.warn(`Update order status failed: User ${userId} not authorized to set ${status} for item ${itemIndex}`, { orderId, ip: req.ip });
      return res.status(403).json({ success: false, message: `Only the seller can mark an item as ${status}` });
    }
    if (status === 'delivered' && order.customerId.toString() !== userId) {
      logger.warn(`Update order status failed: User ${userId} not authorized to mark item ${itemIndex} as delivered`, { orderId, ip: req.ip });
      return res.status(403).json({ success: false, message: 'Only the buyer can mark an item as delivered' });
    }

    const oldStatus = item.status;
    item.status = status;

    const itemStatuses = order.items.map(i => i.status);
    if (itemStatuses.every(s => s === 'delivered' || s === 'cancelled')) {
      order.status = 'delivered';
    } else if (itemStatuses.every(s => ['shipped', 'out_for_delivery', 'delivered'].includes(s) || s === 'cancelled')) {
      order.status = 'shipped';
    } else {
      order.status = 'pending';
    }

    await order.save({ session });

    const listing = await listingModel.findOne({ 'productInfo.productId': item.productId }).session(session);
    const sellerUpdate = {};
    const buyerUpdate = {};

    if (status === 'delivered' && oldStatus !== 'delivered') {
      sellerUpdate['stats.completedOrdersCount'] = 1;
      sellerUpdate['analytics.salesCount'] = 1;
      sellerUpdate['analytics.totalSales.amount'] = item.price * item.quantity * (1 - commissionRate);
      sellerUpdate['stats.pendingOrdersCount'] = -1;
      sellerUpdate['financials.balance'] = item.price * item.quantity * (1 - commissionRate);
      buyerUpdate['stats.completedOrdersCount'] = 1;
      buyerUpdate['stats.pendingOrdersCount'] = -1;
      if (listing) {
        listing.isSold = listing.inventory <= item.quantity;
        await listing.save({ session });
      }

      const transaction = await TransactionModel.findOne({ orderId: order._id }).session(session);
      if (!transaction) {
        logger.warn(`Update order status failed: Transaction not found for order ${orderId}`, { userId, ip: req.ip });
        throw new Error('Transaction not found for order');
      }
      const transactionItem = transaction.items.find(tItem => tItem.itemId.toString() === item._id.toString());
      if (!transactionItem) {
        logger.warn(`Update order status failed: Transaction item not found for item ${itemIndex}`, { userId, orderId, ip: req.ip });
        throw new Error('Transaction item not found');
      }
      if (transactionItem.payoutStatus !== 'pending') {
        logger.warn(`Payout already processed for item ${itemIndex}`, { userId, orderId, ip: req.ip });
      } else {
        await withRetry(() => initiatePayout(transaction._id, transactionItem.itemId, session), 3, `Initiate payout for item ${itemIndex} in order ${orderId}`);
      }
    } else if (['processing', 'shipped', 'out_for_delivery'].includes(status) && oldStatus === 'pending') {
      sellerUpdate['stats.pendingOrdersCount'] = -1;
      buyerUpdate['stats.pendingOrdersCount'] = -1;
    }

    if (Object.keys(sellerUpdate).length) {
      await userModel.updateOne({ _id: item.sellerId }, { $inc: sellerUpdate }, { session });
    }
    if (Object.keys(buyerUpdate).length) {
      await userModel.updateOne({ _id: order.customerId }, { $inc: buyerUpdate }, { session });
    }

    const recipient = ['processing', 'shipped', 'out_for_delivery'].includes(status) ? order.customerId : item.sellerId;
    if (recipient && recipient.personalInfo?.email && recipient.preferences?.emailNotifications) {
      await withRetry(async () => {
        const emailContent = generateOrderStatusEmail(
          recipient.personalInfo.fullname || (['processing', 'shipped', 'out_for_delivery'].includes(status) ? 'Buyer' : 'Seller'),
          item.name,
          orderId,
          status,
          ['processing', 'shipped', 'out_for_delivery'].includes(status) ? item.sellerId._id : order.customerId._id
        );
        const emailSent = await sendEmail(
          recipient.personalInfo.email,
          `Order Status Update - BeiFity.Com`,
          emailContent
        );
        if (!emailSent) throw new Error(`Failed to send status update email to ${['processing', 'shipped', 'out_for_delivery'].includes(status) ? 'buyer' : 'seller'} ${recipient._id}`);
        logger.info(`Status update email sent to ${['processing', 'shipped', 'out_for_delivery'].includes(status) ? 'buyer' : 'seller'} ${recipient._id}`, { orderId, itemIndex });
      }, 3, `Send status update email for item ${itemIndex} in order ${orderId}`);
    } else {
      logger.info(`Recipient ${recipient._id} has email notifications disabled or no email`, { orderId, itemIndex });
    }

    const notificationRecipientId = ['processing', 'shipped', 'out_for_delivery'].includes(status) ? order.customerId._id : item.sellerId._id;
    const notificationRecipient = ['processing', 'shipped', 'out_for_delivery'].includes(status) ? order.customerId : item.sellerId;
    await withRetry(async () => {
      const notificationReq = {
        user: { _id: notificationRecipientId, personalInfo: notificationRecipient.personalInfo || {} },
        body: {
          userId: notificationRecipientId.toString(),
          sender: userId,
          type: 'order_status',
          content: `Your order item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(orderId)}) is now ${status}.`,
        },
      };
      await createNotification(notificationReq, {
        status: () => ({
          json: data => {
            if (!data.success) throw new Error(`Failed to create status notification: ${data.message}`);
            logger.info(`Status notification created for ${['processing', 'shipped', 'out_for_delivery'].includes(status) ? 'buyer' : 'seller'} ${notificationRecipientId}`, { orderId, notificationId: data.data?._id });
          },
        }),
      });
    }, 3, `Create status notification for item ${itemIndex} in order ${orderId}`);

    // Notify admins when status is 'delivered'
    if (status === 'delivered') {
      const admins = await userModel.find({ 'personalInfo.isAdmin': true }).select('_id personalInfo.email personalInfo.fullname preferences').session(session);
      for (const admin of admins) {
        await withRetry(async () => {
          const adminNotificationReq = {
            user: { _id: admin._id, personalInfo: admin.personalInfo || {} },
            body: {
              userId: admin._id.toString(),
              sender: userId,
              type: 'order_status',
              content: `Order item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(orderId)}) has been marked as delivered by the buyer (ID: ${order.customerId._id}).`,
            },
          };
          await createNotification(adminNotificationReq, {
            status: () => ({
              json: data => {
                if (!data.success) throw new Error(`Failed to create admin status notification: ${data.message}`);
                logger.info(`Status notification created for admin ${admin._id}`, { orderId, itemIndex, notificationId: data.data?._id });
              },
            }),
          });
        }, 3, `Create admin status notification for item ${itemIndex} in order ${orderId}`);

        if (admin.personalInfo?.email && admin.preferences?.emailNotifications) {
          await withRetry(async () => {
            const adminEmailContent = generateOrderStatusEmailAdmin(
              admin.personalInfo.fullname || 'Admin',
              item.name,
              orderId,
              status,
              order.customerId._id.toString(),
              item.sellerId._id.toString()
            );
            const adminEmailSent = await sendEmail(
              admin.personalInfo.email,
              'Order Status Update - BeiFity.Com Admin Notification',
              adminEmailContent
            );
            if (!adminEmailSent) throw new Error('Failed to send admin status email');
            logger.info(`Status email sent to admin ${admin._id}`, { orderId, itemIndex });
          }, 3, `Send admin status email for item ${itemIndex} in order ${orderId}`);
        } else {
          logger.info(`Admin ${admin._id} has email notifications disabled or no email`, { orderId, itemIndex });
        }
      }
    }

    await session.commitTransaction();
    transactionCommitted = true;
    logger.info(`Order status updated: ${orderId}, item ${itemIndex} to ${status} by user ${userId}`);
    return res.status(200).json({
      success: true,
      message: 'Item status updated successfully',
      data: { orderId: order.orderId, items: order.items },
    });
  } catch (error) {
    if (!transactionCommitted) {
      await session.abortTransaction();
      logger.info(`Transaction aborted for order status update`, { userId: req.user?._id, orderId, itemIndex });
    }
    logger.error(`Error updating order status: ${error.message}`, { stack: error.stack, userId: req.user?._id, orderId, itemIndex });
    return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  } finally {
    session.endSession();
  }
};

/**
 * Cancel Order Item
 * @route PATCH /api/orders/cancel-item
 * @desc Cancel an order item and process refund if applicable
 * @access Private (requires JWT token)
 */
export const cancelOrderItem = async (req, res) => {
  const session = await mongoose.startSession({ defaultTransactionOptions: { timeout: SESSION_TIMEOUT } });
  let transactionCommitted = false;
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Cancel order item failed: No user data in request', { ip: req.ip });
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { orderId, itemId, userId } = req.body;
    const requesterId = req.user._id.toString();

    if (!orderId || !itemId || !userId) {
      logger.warn('Cancel order item failed: Missing required fields', { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'orderId, itemId, and userId are required' });
    }

    if (requesterId !== userId) {
      logger.warn(`Cancel order item failed: User ${requesterId} attempted to cancel as ${userId}`, { ip: req.ip });
      return res.status(403).json({ success: false, message: 'Unauthorized to cancel this order' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Cancel order item failed: Invalid userId ${userId}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    let order = await orderModel.findOne({ orderId }).session(session).populate('items.sellerId customerId');
    if (!order) {
      logger.warn(`Cancel order item failed: Order ${orderId} not found`, { userId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.items.find(i => i.productId === itemId);
    if (!item) {
      logger.warn(`Cancel order item failed: Item ${itemId} not found in order ${orderId}`, { userId, ip: req.ip });
      return res.status(404).json({ success: false, message: 'Item not found in this order' });
    }
    if (item.status !== 'pending') {
      logger.warn(`Cancel order item failed: Item ${itemId} is not pending`, { userId, orderId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Only pending items can be cancelled' });
    }
    if (item.cancelled) {
      logger.warn(`Cancel order item failed: Item ${itemId} is already cancelled`, { userId, orderId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Item is already cancelled' });
    }

    if (item.sellerId._id.toString() !== userId && order.customerId._id.toString() !== userId) {
      logger.warn(`Cancel order item failed: User ${userId} not authorized to cancel item ${itemId}`, { orderId, ip: req.ip });
      return res.status(403).json({ success: false, message: 'Only the buyer or seller can cancel this item' });
    }

    item.cancelled = true;
    item.status = 'cancelled';
    item.refundedAmount = item.price * item.quantity;

    let refundMessage = '';
    let refundStatus = 'none';
    let refundedAmount = 0;

    if (order.transactionId) {
      const transaction = await TransactionModel.findOne({ _id: order.transactionId }).session(session);
      if (!transaction) {
        logger.warn(`Cancel order item failed: Transaction not found for order ${orderId}`, { userId, ip: req.ip });
        throw new Error('Transaction not found for order');
      }

      const transactionItem = transaction.items.find(tItem => tItem.itemId.toString() === item._id.toString());
      if (!transactionItem) {
        logger.warn(`Cancel order item failed: Transaction item not found for item ${itemId}`, { userId, orderId, ip: req.ip });
        throw new Error('Transaction item not found');
      }

      if (transactionItem.refundStatus !== 'none') {
        logger.warn(`Cancel order item failed: Refund already ${transactionItem.refundStatus} for item ${itemId}`, { userId, orderId, ip: req.ip });
        return res.status(400).json({ success: false, message: `Refund already ${transactionItem.refundStatus} for this item` });
      }

      if (transaction.status === 'completed' && order.status !== 'paid') {
        logger.info(`Syncing order ${orderId} status to paid due to completed transaction`, { userId, ip: req.ip });
        order.status = 'paid';
        await order.save({ session });
      }

      if (transaction.isReversed) {
        logger.warn(`Order ${orderId} has reversed transaction, cannot cancel item ${itemId}`, { userId, ip: req.ip });
        return res.status(400).json({ success: false, message: 'Order cannot be cancelled as the transaction has been reversed. Full refund already processed.' });
      }

      if (transaction.status === 'completed') {
        logger.debug(`Initiating refund for item ${itemId} in order ${orderId}, transaction status: ${transaction.status}`, { userId, ip: req.ip });
        const refundResult = await withRetry(() => initiateRefund(order._id, item.productId, session), 3, `Initiate refund for item ${itemId} in order ${orderId}`);
        if (refundResult.error) {
          logger.warn(`Failed to initiate refund for item ${itemId} in order ${orderId}: ${refundResult.message}`, { userId, ip: req.ip, refundError: refundResult });
          refundMessage = ` (refund failed: ${refundResult.message})`;
          throw new Error(refundResult.message);
        } else {
          refundMessage = ` (refund of KES ${item.price * item.quantity} initiated)`;
          refundStatus = 'pending';
          refundedAmount = item.price * item.quantity;
          item.refundStatus = 'pending';
          transactionItem.refundStatus = 'pending';
          transactionItem.refundedAmount = refundedAmount;
          await transaction.save({ session });
        }
      } else {
        refundMessage = ` (no refund needed as transaction status is ${transaction.status})`;
        logger.info(`No refund initiated for item ${itemId} in order ${orderId}: transaction status is ${transaction.status}`, { userId, ip: req.ip });
      }
    } else {
      refundMessage = ' (no refund needed as no transaction exists)';
      logger.info(`No refund initiated for item ${itemId} in order ${orderId}: no transaction found`, { userId, ip: req.ip });
    }

    const savedOrder = await order.save({ session });
    logger.debug(`Order updated after cancellation`, {
      orderId,
      itemId,
      totalAmount: savedOrder.totalAmount,
      status: savedOrder.status,
      items: savedOrder.items.map(i => ({
        productId: i.productId,
        status: i.status,
        cancelled: i.cancelled,
        refundStatus: i.refundStatus,
        refundedAmount: i.refundedAmount
      })),
    });

    await userModel.updateOne(
      { _id: order.customerId._id },
      { $inc: { 'stats.failedOrdersCount': 1, 'stats.pendingOrdersCount': -1 } },
      { session }
    );
    await userModel.updateOne(
      { _id: item.sellerId._id },
      { $inc: { 'stats.failedOrdersCount': 1, 'stats.pendingOrdersCount': -1 } },
      { session }
    );
    await listingModel.updateOne(
      { 'productInfo.productId': item.productId },
      { $inc: { 'analytics.ordersNumber': -1, 'inventory': item.quantity }, $set: { isSold: false } },
      { session }
    );

    const recipient = item.sellerId._id.toString() === userId ? order.customerId : item.sellerId;
    if (recipient && recipient.personalInfo?.email && recipient.preferences?.emailNotifications) {
      await withRetry(async () => {
        const emailContent = generateOrderCancellationEmail(
          recipient.personalInfo.fullname || (item.sellerId._id.toString() === userId ? 'Buyer' : 'Seller'),
          item.name,
          orderId,
          item.sellerId._id.toString() === userId ? 'seller' : 'buyer',
          refundMessage.includes('refund initiated') ? `A refund of KES ${item.price * item.quantity} has been initiated for the buyer.` : refundMessage,
          userId
        );
        const emailSent = await sendEmail(
          recipient.personalInfo.email,
          'Order Item Cancellation - BeiFity.Com',
          emailContent
        );
        if (!emailSent) throw new Error(`Failed to send cancellation email to ${item.sellerId._id.toString() === userId ? 'buyer' : 'seller'} ${recipient._id}`);
        logger.info(`Cancellation email sent to ${item.sellerId._id.toString() === userId ? 'buyer' : 'seller'} ${recipient._id}`, { orderId, itemId });
      }, 3, `Send cancellation email for item ${itemId} in order ${orderId}`);
    } else {
      logger.info(`Recipient ${recipient._id} has email notifications disabled or no email`, { orderId, itemId });
    }

    const notificationRecipientId = item.sellerId._id.toString() === userId ? order.customerId._id : item.sellerId._id;
    const notificationRecipient = item.sellerId._id.toString() === userId ? order.customerId : item.sellerId;
    await withRetry(async () => {
      const notificationReq = {
        user: { _id: notificationRecipientId, personalInfo: notificationRecipient.personalInfo || {} },
        body: {
          userId: notificationRecipientId.toString(),
          sender: userId,
          type: 'order_cancellation',
          content: `The ${item.sellerId._id.toString() === userId ? 'seller' : 'buyer'} cancelled the order item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(orderId)}). ${refundMessage}`,
        },
      };
      await createNotification(notificationReq, {
        status: () => ({
          json: data => {
            if (!data.success) {
              logger.warn(`Failed to create cancellation notification: ${data.message}`, { orderId, itemId });
            } else {
              logger.info(`Cancellation notification created for ${item.sellerId._id.toString() === userId ? 'buyer' : 'seller'} ${notificationRecipientId}`, { orderId, notificationId: data.data?._id });
            }
          },
        }),
      });
    }, 3, `Create cancellation notification for item ${itemId} in order ${orderId}`);

    // Notify admins of cancellation
    const admins = await userModel.find({ 'personalInfo.isAdmin': true }).select('_id personalInfo.email personalInfo.fullname preferences').session(session);
    for (const admin of admins) {
      await withRetry(async () => {
        const adminNotificationReq = {
          user: { _id: admin._id, personalInfo: admin.personalInfo || {} },
          body: {
            userId: admin._id.toString(),
            sender: userId,
            type: 'order_cancellation',
            content: `The ${item.sellerId._id.toString() === userId ? 'seller' : 'buyer'} (ID: ${userId}) cancelled the order item "${sanitizeHtml(item.name)}" (Order ID: ${sanitizeHtml(orderId)}). ${refundMessage}`,
          },
        };
        await createNotification(adminNotificationReq, {
          status: () => ({
            json: data => {
              if (!data.success) throw new Error(`Failed to create admin cancellation notification: ${data.message}`);
              logger.info(`Cancellation notification created for admin ${admin._id}`, { orderId, itemId, notificationId: data.data?._id });
            },
          }),
        });
      }, 3, `Create admin cancellation notification for item ${itemId} in order ${orderId}`);

      if (admin.personalInfo?.email && admin.preferences?.emailNotifications) {
        await withRetry(async () => {
          const adminEmailContent = generateOrderCancellationEmailAdmin(
            admin.personalInfo.fullname || 'Admin',
            item.name,
            orderId,
            item.sellerId._id.toString() === userId ? 'seller' : 'buyer',
            refundMessage.includes('refund initiated') ? `A refund of KES ${item.price * item.quantity} has been initiated for the buyer.` : refundMessage,
            userId
          );
          const adminEmailSent = await sendEmail(
            admin.personalInfo.email,
            'Order Item Cancellation - BeiFity.Com Admin Notification',
            adminEmailContent
          );
          if (!adminEmailSent) throw new Error('Failed to send admin cancellation email');
          logger.info(`Cancellation email sent to admin ${admin._id}`, { orderId, itemId });
        }, 3, `Send admin cancellation email for item ${itemId} in order ${orderId}`);
      } else {
        logger.info(`Admin ${admin._id} has email notifications disabled or no email`, { orderId, itemId });
      }
    }

    await session.commitTransaction();
    transactionCommitted = true;
    logger.info(`Item ${itemId} cancelled in order ${orderId} by user ${userId}${refundMessage}`);
    res.status(200).json({
      success: true,
      message: `Item cancelled successfully ${refundMessage}`,
      data: {
        orderId: order.orderId,
        items: order.items,
        totalAmount: order.totalAmount,
        status: order.status,
        refundStatus: item.refundStatus,
        refundedAmount: item.refundedAmount,
      },
    });
  } catch (error) {
    if (!transactionCommitted) {
      await session.abortTransaction();
      logger.info(`Transaction aborted for order item cancellation`, { userId: req.user?._id, orderId, itemId });
    }
    logger.error(`Error cancelling item: ${error.message}`, { stack: error.stack, userId: req.user?._id, orderId, itemId });
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  } finally {
    session.endSession();
  }
};

/**
 * Get Orders
 * @route POST /api/orders/get-orders
 * @desc Retrieve orders for a seller
 * @access Private (requires JWT token)
 */
export const getOrders = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Get orders failed: No user data in request', { ip: req.ip });
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { userId } = req.body;
    const requesterId = req.user._id.toString();

    if (requesterId !== userId && !req.user.personalInfo?.isAdmin) {
      logger.warn(`Get orders failed: User ${requesterId} unauthorized to access orders for ${userId}`, { ip: req.ip });
      return res.status(403).json({ success: false, message: 'Unauthorized to access these orders' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Get orders failed: Invalid userId ${userId}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    const orders = await orderModel
      .find({ 'items.sellerId': userId })
      .populate('customerId', 'personalInfo.fullname personalInfo.email')
      .lean();

    if (!orders || orders.length === 0) {
      logger.info(`No orders found for seller ${userId}`);
      return res.status(200).json({ success: true, data: [], message: 'No orders found' });
    }

    const filteredOrders = orders.map(order => ({
      orderId: sanitizeHtml(order.orderId),
      customer: {
        id: order.customerId._id,
        fullname: sanitizeHtml(order.customerId.personalInfo.fullname || 'Unknown'),
        email: sanitizeHtml(order.customerId.personalInfo.email || ''),
      },
      totalAmount: order.totalAmount,
      deliveryFee: order.deliveryFee,
      status: order.status,
      items: order.items
        .filter(item => item.sellerId.toString() === userId)
        .map(item => ({
          ...item,
          _id: item._id.toString(),
          name: sanitizeHtml(item.name),
          productId: sanitizeHtml(item.productId),
          color: sanitizeHtml(item.color),
          size: item.size ? sanitizeHtml(item.size) : undefined,
          status: item.status,
        })),
      deliveryAddress: {
        country: sanitizeHtml(order.deliveryAddress.country),
        county: sanitizeHtml(order.deliveryAddress.county || ''),
        constituency: sanitizeHtml(order.deliveryAddress.constituency || ''),
        nearestTown: sanitizeHtml(order.deliveryAddress.nearestTown || ''),
        phone: sanitizeHtml(order.deliveryAddress.phone),
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));

    logger.info(`Retrieved ${filteredOrders.length} orders for seller ${userId}`, { requesterId });
    return res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: filteredOrders,
    });
  } catch (error) {
    logger.error(`Error fetching orders: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};

/**
 * Get Buyer Orders
 * @route POST /api/orders/get-buyer-orders
 * @desc Retrieve orders for a buyer
 * @access Private (requires JWT token)
 */
export const getBuyerOrders = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Get buyer orders failed: No user data in request', { ip: req.ip });
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { customerId } = req.body;
    const requesterId = req.user._id.toString();

    if (requesterId !== customerId && !req.user.personalInfo?.isAdmin) {
      logger.warn(`Get buyer orders failed: User ${requesterId} unauthorized to access orders for ${customerId}`, { ip: req.ip });
      return res.status(403).json({ success: false, message: 'Unauthorized to access these orders' });
    }

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      logger.warn(`Get buyer orders failed: Invalid customerId ${customerId}`, { userId: requesterId, ip: req.ip });
      return res.status(400).json({ success: false, message: 'Invalid customerId' });
    }

    const orders = await orderModel
      .find({ customerId })
      .populate('items.sellerId', 'personalInfo.fullname personalInfo.email personalInfo.phone')
      .lean();

    if (!orders || orders.length === 0) {
      logger.info(`No orders found for buyer ${customerId}`);
      return res.status(200).json({ success: true, data: [], message: 'No orders found for this buyer' });
    }

    const formattedOrders = orders.map(order => ({
      orderId: order.orderId,
      totalAmount: order.totalAmount,
      deliveryFee: order.deliveryFee,
      status: order.status,
      items: order.items.map(item => ({
        ...item,
        _id: item._id.toString(),
        name: sanitizeHtml(item.name),
        productId: sanitizeHtml(item.productId),
        color: sanitizeHtml(item.color),
        size: item.size ? sanitizeHtml(item.size) : undefined,
        status: item.status,
        refundStatus: item.refundStatus || 'none',
        refundedAmount: item.refundedAmount || 0,
        seller: {
          id: item.sellerId._id,
          fullname: sanitizeHtml(item.sellerId.personalInfo.fullname || 'Unknown'),
          email: sanitizeHtml(item.sellerId.personalInfo.email || ''),
          phone: sanitizeHtml(item.sellerId.personalInfo.phone || ''),
        },
      })),
      deliveryAddress: {
        country: sanitizeHtml(order.deliveryAddress.country),
        county: sanitizeHtml(order.deliveryAddress.county || ''),
        constituency: sanitizeHtml(order.deliveryAddress.constituency || ''),
        nearestTown: sanitizeHtml(order.deliveryAddress.nearestTown || ''),
        phone: sanitizeHtml(order.deliveryAddress.phone),
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));

    logger.info(`Retrieved ${formattedOrders.length} orders for buyer ${customerId}`, { requesterId });
    return res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: formattedOrders,
    });
  } catch (error) {
    logger.error(`Error fetching buyer orders: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};