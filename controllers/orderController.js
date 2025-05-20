
import { userModel } from '../models/User.js';
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import validator from 'validator';
import logger from '../utils/logger.js';
import { sendEmail } from '../utils/sendEmail.js';
import { createNotification } from './notificationController.js';
import { orderModel } from '../models/Order.js';
import { listingModel } from '../models/Listing.js';

// Load environment variables
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';

// HTML Email Template Function for Seller
const generateOrderEmailSeller = (sellerName, buyerName, items, orderTime, deliveryAddress, totalPrice, buyerId, orderId) => {
  const sanitizedSellerName = sanitizeHtml(sellerName);
  const sanitizedBuyerName = sanitizeHtml(buyerName);
  const sanitizedOrderTime = sanitizeHtml(orderTime);
  const sanitizedCounty = sanitizeHtml(deliveryAddress.county || '');
  const sanitizedNearestTown = sanitizeHtml(deliveryAddress.nearestTown || '');
  const sanitizedCountry = sanitizeHtml(deliveryAddress.country || 'Kenya');

  const itemDetails = items.map(item => `
    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;">
      <strong>Item Name:</strong> ${sanitizeHtml(item.name)} <br>
      <strong>Quantity:</strong> ${sanitizeHtml(String(item.quantity))} <br>
      <strong>Price:</strong> KES ${sanitizeHtml(String(item.price))} <br>
      <strong>Color:</strong> ${sanitizeHtml(item.color)}${item.size ? ` <br><strong>Size:</strong> ${sanitizeHtml(item.size)}` : ''}
    </p>
  `).join('<hr style="border: 1px solid #e5e7eb; margin: 10px 0;">');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Order Notification</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="${FRONTEND_URL}/assets/logo-without-Dr_6ibJh.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Exciting News, ${sanitizedSellerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">You've Got a New Order!</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedSellerName}, a buyer has just placed an order for your item(s) on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>. Here’s everything you need to get started:
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Order Summary (Order ID: ${sanitizeHtml(orderId)})</p>
                    ${itemDetails}
                    <p style="font-size: 13px; color: #475569; margin: 10px 0 8px;"><strong>Buyer Name:</strong> ${sanitizedBuyerName}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Order Placed On:</strong> ${sanitizedOrderTime}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Total Price:</strong> KES ${sanitizeHtml(String(totalPrice))}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Shipping Address:</strong> ${sanitizedCounty || sanitizedNearestTown ? `${sanitizedCounty}, ${sanitizedNearestTown}, ` : ''}${sanitizedCountry} (Full details via chat)</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/chat/${sanitizeHtml(buyerId)}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">Message Buyer Now</a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> Reach out to the buyer via chat to confirm the order details and arrange payment and shipping. Buyers are advised to verify the product before paying.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Assistance?</strong> Visit your seller dashboard or contact support if the buyer doesn’t respond.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Keep shining on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 600; font-size: 14px; font-weight: 700;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

// HTML Email Template Function for Buyer
const generateOrderEmailBuyer = (buyerName, items, orderTime, totalPrice, deliveryAddress, orderId, sellerIds) => {
  const sanitizedBuyerName = sanitizeHtml(buyerName);
  const sanitizedOrderTime = sanitizeHtml(orderTime);
  const sanitizedCounty = sanitizeHtml(deliveryAddress.county || '');
  const sanitizedNearestTown = sanitizeHtml(deliveryAddress.nearestTown || '');
  const sanitizedCountry = sanitizeHtml(deliveryAddress.country || 'Kenya');

  const itemDetails = items.map(item => `
    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;">
      <strong>Item Name:</strong> ${sanitizeHtml(item.name)} <br>
      <strong>Quantity:</strong> ${sanitizeHtml(String(item.quantity))} <br>
      <strong>Price:</strong> KES ${sanitizeHtml(String(item.price))} <br>
      <strong>Color:</strong> ${sanitizeHtml(item.color)}${item.size ? ` <br><strong>Size:</strong> ${sanitizeHtml(item.size)}` : ''}
    </p>
  `).join('<hr style="border: 1px solid #e5e7eb; margin: 10px 0;">');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Order Confirmation</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
              <tr>
                <td>
                  <img src="${FRONTEND_URL}/assets/logo-without-Dr_6ibJh.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                </td>
              </tr>
              <tr>
                <td>
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Thank You, ${sanitizedBuyerName}!</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your Order Has Been Placed!</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedBuyerName}, we’re thrilled to confirm your order on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>. Here are the details:
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 30px;">
                    <p style="font-size: 14px; color: #1e40af; font-weight: 600; margin: 0 0 10px;">Order Summary (Order ID: ${sanitizeHtml(orderId)})</p>
                    ${itemDetails}
                    <p style="font-size: 13px; color: #475569; margin: 10px 0 8px;"><strong>Order Placed On:</strong> ${sanitizedOrderTime}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0 0 8px;"><strong>Total Price:</strong> KES ${sanitizeHtml(String(totalPrice))}</p>
                    <p style="font-size: 13px; color: #475569; margin: 0;"><strong>Shipping Address:</strong> ${sanitizedCounty || sanitizedNearestTown ? `${sanitizedCounty}, ${sanitizedNearestTown}, ` : ''}${sanitizedCountry}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}/chat" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">Contact Seller(s)</a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Next Steps:</strong> The seller(s) will reach out soon via chat to confirm the order and discuss payment and shipping details. Please verify the product before making any payments.
                  </p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Help?</strong> Check your buyer dashboard or contact our support team if you have any questions.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Happy shopping on BeiFity!</p>
                  <span style="color: #1e40af; font-weight: 600; font-size: 14px; font-weight: 700;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

/**
 * Place Order
 * @route POST /api/orders
 * @desc Place a new order
 * @access Private (requires JWT token)
 */
export const placeOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Place order failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const data = req.body;
    if (req.user._id.toString() !== data.customerId) {
      logger.warn(`Place order failed: User ${req.user._id} attempted to order as ${data.customerId}`);
      return res.status(403).json({ success: false, message: 'Unauthorized to place order for this customer' });
    }

    // Validate required fields
    const requiredFields = ['customerId', 'totalAmount', 'items', 'deliveryAddress'];
    for (const field of requiredFields) {
      if (!data[field]) {
        logger.warn(`Place order failed: Missing required field ${field}`, { userId: req.user._id });
        return res.status(400).json({ success: false, message: `Missing required field: ${field}` });
      }
    }

    // Validate items array
    if (!Array.isArray(data.items) || data.items.length === 0) {
      logger.warn('Place order failed: Empty items array', { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Your cart is empty. Please add items to place an order' });
    }

    const itemRequiredFields = ['sellerId', 'quantity', 'name', 'productId', 'color', 'price'];
    for (const item of data.items) {
      for (const field of itemRequiredFields) {
        if (!item[field]) {
          logger.warn(`Place order failed: Missing item field ${field}`, { userId: req.user._id, productId: item.productId });
          return res.status(400).json({ success: false, message: `Missing required item field: ${field}` });
        }
      }
      if (typeof item.quantity !== 'number' || item.quantity < 1) {
        logger.warn(`Place order failed: Invalid quantity ${item.quantity}`, { userId: req.user._id, productId: item.productId });
        return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
      }
      if (typeof item.price !== 'number' || item.price <= 0) {
        logger.warn(`Place order failed: Invalid price ${item.price}`, { userId: req.user._id, productId: item.productId });
        return res.status(400).json({ success: false, message: 'Price must be a positive number' });
      }
    }

    // Validate deliveryAddress
    if (!data.deliveryAddress.email || !validator.isEmail(data.deliveryAddress.email)) {
      logger.warn('Place order failed: Invalid email', { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Valid email required in delivery address' });
    }
    if (!data.deliveryAddress.phone.toString() || !validator.isMobilePhone(data.deliveryAddress.phone.toString(), 'any')) {
      logger.warn('Place order failed: Invalid phone', { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Valid phone number required in delivery address' });
    }

    // Validate totalAmount
    const calculatedTotal = data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (Math.abs(data.totalAmount - calculatedTotal) > 0.01) {
      logger.warn(`Place order failed: Total amount mismatch. Expected ${calculatedTotal}, got ${data.totalAmount}`, { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Total amount does not match item prices' });
    }

    // Validate customerId
    if (!mongoose.Types.ObjectId.isValid(data.customerId)) {
      logger.warn(`Place order failed: Invalid customerId ${data.customerId}`, { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Invalid customerId' });
    }
    const user = await userModel.findById(data.customerId).session(session);
    if (!user) {
      logger.warn(`Place order failed: Customer ${data.customerId} not found`, { userId: req.user._id });
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Validate sellerIds and listings
    const listings = new Map();
    for (const item of data.items) {
      if (!mongoose.Types.ObjectId.isValid(item.sellerId)) {
        logger.warn(`Place order failed: Invalid sellerId ${item.sellerId}`, { userId: req.user._id, productId: item.productId });
        return res.status(400).json({ success: false, message: `Invalid sellerId: ${item.sellerId}` });
      }
      const listing = await ListingModel.findOne({ 'productInfo.productId': item.productId }).session(session);
      if (!listing || listing.verified !== 'Verified' || listing.isSold || listing.inventory < item.quantity) {
        logger.warn(`Place order failed: Listing ${item.productId} not found, not verified, sold, or insufficient inventory`, { userId: req.user._id });
        return res.status(400).json({ success: false, message: `Listing not available for productId: ${item.productId}` });
      }
      listings.set(item.productId, listing);
    }

    // Generate order data
    const orderData = {
      // Let Mongoose generate orderId via schema default
      customerId: data.customerId,
      totalAmount: data.totalAmount,
      status: 'pending',
      items: data.items.map(item => ({
        sellerId: new mongoose.Types.ObjectId(item.sellerId),
        quantity: item.quantity,
        name: sanitizeHtml(item.name),
        productId: item.productId,
        color: sanitizeHtml(item.color),
        price: item.price,
        size: item.size ? sanitizeHtml(item.size) : undefined,
        status: 'pending',
        cancelled: false,
      })),
      deliveryAddress: {
        country: sanitizeHtml(data.deliveryAddress.country || 'Kenya'),
        county: sanitizeHtml(data.deliveryAddress.county || ''),
        constituency: sanitizeHtml(data.deliveryAddress.constituency || ''),
        nearestTown: sanitizeHtml(data.deliveryAddress.nearestTown || ''),
        email: sanitizeHtml(data.deliveryAddress.email),
        phone: sanitizeHtml(data.deliveryAddress.phone),
      },
    };

    // Create and save the new order
    const newOrder = new orderModel(orderData);
    const savedOrder = await newOrder.save({ session });

    // Update user's orders and analytics
    await userModel.updateOne(
      { _id: user._id },
      {
        $push: { orders: savedOrder._id },
        $inc: { 'stats.pendingOrdersCount': 1, 'analytics.orderCount': 1 },
      },
      { session }
    );

    // Update sellers' and listings' analytics
    for (const item of data.items) {
      await listingModel.updateOne(
        { 'productInfo.productId': item.productId },
        {
          $inc: { 'analytics.ordersNumber': 1, inventory: -item.quantity },
          isSold: listings.get(item.productId).inventory - item.quantity <= 0,
        },
        { session }
      );
      await userModel.updateOne(
        { _id: item.sellerId },
        {
          $inc: { 'stats.pendingOrdersCount': 1 },
        },
        { session }
      );
    }

    // Commit transaction
    await session.commitTransaction();

    // Send emails and notifications to sellers and buyer
    const sellerItemsMap = new Map();
    savedOrder.items.forEach(item => {
      const sellerId = item.sellerId.toString();
      if (!sellerItemsMap.has(sellerId)) {
        sellerItemsMap.set(sellerId, []);
      }
      sellerItemsMap.get(sellerId).push(item);
    });

    const buyerName = sanitizeHtml(user.personalInfo.fullname || 'Buyer');
    const orderTime = savedOrder.createdAt.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
    const totalOrderPrice = savedOrder.totalAmount;

    // Send email to buyer
    const buyerEmailContent = generateOrderEmailBuyer(
      buyerName,
      savedOrder.items,
      orderTime,
      totalOrderPrice,
      savedOrder.deliveryAddress,
      savedOrder.orderId,
      [...new Set(savedOrder.items.map(item => item.sellerId.toString()))]
    );
    const buyerEmailSent = await sendEmail(
      savedOrder.deliveryAddress.email,
      `Your Order Confirmation - BeiFity.Com`,
      buyerEmailContent
    );
    if (!buyerEmailSent) {
      logger.warn(`Failed to send order confirmation email to buyer ${data.customerId}`, { orderId: savedOrder.orderId });
    } else {
      logger.info(`Order confirmation email sent to buyer ${data.customerId}`, { orderId: savedOrder.orderId });
    }

    // Create buyer notification
    const buyerNotificationReq = {
      user: { _id: data.customerId },
      body: {
        userId: data.customerId,
        sender: data.customerId,
        type: 'order',
        content: `Your order (ID: ${savedOrder.orderId}) has been placed. Contact the seller(s) to confirm details.`,
      },
    };
    const buyerNotificationRes = {
      status: code => ({
        json: data => {
          if (!data.success) {
            logger.warn(`Failed to create order notification for buyer ${data.customerId}: ${data.message}`, { orderId: savedOrder.orderId });
          }
        },
      }),
    };
    await createNotification(buyerNotificationReq, buyerNotificationRes);

    // Send emails and notifications to sellers
    for (const [sellerId, items] of sellerItemsMap) {
      const seller = await userModel.findById(sellerId);
      if (!seller || !seller.personalInfo.email) {
        logger.warn(`Failed to notify seller ${sellerId}: Seller not found or no email`, { orderId: savedOrder.orderId });
        continue;
      }

      const sellerName = sanitizeHtml(seller.personalInfo.fullname || 'Seller');
      const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const sellerEmailContent = generateOrderEmailSeller(
        sellerName,
        buyerName,
        items,
        orderTime,
        savedOrder.deliveryAddress,
        totalPrice,
        data.customerId,
        savedOrder.orderId
      );

      const sellerEmailSent = await sendEmail(
        seller.personalInfo.email,
        `New Order for Your Product(s) - BeiFity.Com`,
        sellerEmailContent
      );
      if (!sellerEmailSent) {
        logger.warn(`Failed to send order email to seller ${sellerId}`, { orderId: savedOrder.orderId });
      } else {
        logger.info(`Order email sent to seller ${sellerId}`, { orderId: savedOrder.orderId });
      }

      // Create seller notification
      const sellerNotificationReq = {
        user: { _id: sellerId },
        body: {
          userId: sellerId,
          sender: data.customerId,
          type: 'order',
          content: `You have a new order (ID: ${savedOrder.orderId}) for ${items.map(i => i.name).join(', ')}. Contact the buyer to confirm details.`,
        },
      };
      const sellerNotificationRes = {
        status: code => ({
          json: data => {
            if (!data.success) {
              logger.warn(`Failed to create order notification for seller ${sellerId}: ${data.message}`, { orderId: savedOrder.orderId });
            }
          },
        }),
      };
      await createNotification(sellerNotificationReq, sellerNotificationRes);
    }

    logger.info(`Order placed successfully: ${savedOrder.orderId} by user ${req.user._id}`);
    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: savedOrder,
    });
  } catch (error) {
    await session.abortTransaction();
    if (error instanceof mongoose.Error.ValidationError) {
      logger.warn(`Place order failed: Validation error`, { error: error.errors, userId: req.user?._id });
      return res.status(400).json({ success: false, message: 'Validation error', error: error.errors });
    }
    if (error.code === 11000) {
      logger.warn(`Place order failed: Duplicate order ID`, { userId: req.user?._id });
      return res.status(409).json({ success: false, message: 'Order with this ID already exists' });
    }
    logger.error(`Error placing order: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    session.endSession();
  }
};

/**
 * Get Seller's Orders
 * @route POST /api/orders/seller
 * @desc Retrieve orders for a seller
 * @access Private (requires JWT token)
 */
export const getOrders = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Get orders failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { userId } = req.body;
    if (req.user._id.toString() !== userId) {
      logger.warn(`Get orders failed: User ${req.user._id} attempted to access orders for ${userId}`);
      return res.status(403).json({ success: false, message: 'Unauthorized to access these orders' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Get orders failed: Invalid userId ${userId}`, { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Valid userId is required' });
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
      orderId: order.orderId,
      customer: {
        id: order.customerId._id,
        fullname: sanitizeHtml(order.customerId.personalInfo.fullname || 'Unknown'),
        email: sanitizeHtml(order.customerId.personalInfo.email || ''),
      },
      totalAmount: order.totalAmount,
      items: order.items
        .filter(item => item.sellerId.toString() === userId && !item.cancelled)
        .map(item => ({
          ...item,
          name: sanitizeHtml(item.name),
          color: sanitizeHtml(item.color),
          size: item.size ? sanitizeHtml(item.size) : undefined,
        })),
      deliveryAddress: {
        ...order.deliveryAddress,
        country: sanitizeHtml(order.deliveryAddress.country),
        county: sanitizeHtml(order.deliveryAddress.county || ''),
        constituency: sanitizeHtml(order.deliveryAddress.constituency || ''),
        nearestTown: sanitizeHtml(order.deliveryAddress.nearestTown || ''),
        email: sanitizeHtml(order.deliveryAddress.email),
        phone: sanitizeHtml(order.deliveryAddress.phone),
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));

    logger.info(`Retrieved ${filteredOrders.length} orders for seller ${userId}`);
    return res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: filteredOrders,
    });
  } catch (error) {
    logger.error(`Error fetching orders: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Update Order Status
 * @route PATCH /api/orders/status
 * @desc Update status of an order item
 * @access Private (requires JWT token)
 */
export const updateOrderStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Update order status failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { orderId, productId, status, userId } = req.body;
    if (!orderId || !productId || !status || !userId) {
      logger.warn('Update order status failed: Missing required fields', { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Missing required fields: orderId, productId, status, userId' });
    }

    if (req.user._id.toString() !== userId) {
      logger.warn(`Update order status failed: User ${req.user._id} attempted to update as ${userId}`);
      return res.status(403).json({ success: false, message: 'Unauthorized to update this order' });
    }

    if (typeof orderId !== 'string' || typeof productId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Update order status failed: Invalid field format`, { userId, orderId, productId });
      return res.status(400).json({ success: false, message: 'Invalid format for orderId, productId, or userId' });
    }

    const order = await orderModel.findOne({ orderId }).session(session);
    if (!order) {
      logger.warn(`Update order status failed: Order ${orderId} not found`, { userId });
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.items.find(item => item.productId === productId);
    if (!item || item.sellerId.toString() !== userId) {
      logger.warn(`Update order status failed: Item ${{delegations : { itemId: productId }}}  not found or unauthorized, ${ userId, orderId }`);
      return res.status(403).json({ success: false, message: 'Item not found or not authorized' });
    }

    if (item.cancelled) {
      logger.warn(`Update order status failed: Item ${productId} is cancelled`, { userId, orderId });
      return res.status(400).json({ success: false, message: 'Cannot update status of a cancelled item' });
    }

    if (!['pending', 'shipped', 'delivered'].includes(status)) {
      logger.warn(`Update order status failed: Invalid status ${status}`, { userId, orderId, productId });
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    const oldStatus = item.status;
    item.status = status;

    // Update overall order status if all items are delivered or cancelled
    const allItemsDone = order.items.every(i => i.status === 'delivered' || i.cancelled);
    if (allItemsDone) {
      order.status = 'delivered';
    }

    await order.save({ session });

    // Update analytics
    const listing = await ListingModel.findOne({ 'productInfo.productId': productId }).session(session);
    const sellerUpdate = {};
    const buyerUpdate = {};

    if (status === 'delivered' && oldStatus !== 'delivered') {
      sellerUpdate['stats.completedOrdersCount'] = 1;
      sellerUpdate['analytics.salesCount'] = 1;
      sellerUpdate['analytics.totalSales.amount'] = item.price * item.quantity;
      sellerUpdate['stats.pendingOrdersCount'] = -1;
      buyerUpdate['stats.completedOrdersCount'] = 1;
      buyerUpdate['stats.pendingOrdersCount'] = -1;
      if (listing) {
        listing.isSold = item.quantity >= listing.inventory;
        await listing.save({ session });
      }
    } else if (status === 'shipped' && oldStatus === 'pending') {
      sellerUpdate['stats.pendingOrdersCount'] = -1;
      buyerUpdate['stats.pendingOrdersCount'] = -1;
    }

    if (Object.keys(sellerUpdate).length) {
      await userModel.updateOne({ _id: userId }, { $inc: sellerUpdate }, { session });
    }
    if (Object.keys(buyerUpdate).length) {
      await userModel.updateOne({ _id: order.customerId }, { $inc: buyerUpdate }, { session });
    }

    // Notify buyer
    const buyer = await userModel.findById(order.customerId);
    if (buyer && buyer.personalInfo.email) {
      const emailContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Order Status Update</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
                  <tr>
                    <td>
                      <img src="${FRONTEND_URL}/assets/logo-without-Dr_6ibJh.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Order Update, ${sanitizeHtml(buyer.personalInfo.fullname || 'Buyer')}!</h2>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Your Order Status Has Changed</p>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                        Hi ${sanitizeHtml(buyer.personalInfo.fullname || 'Buyer')}, great news! The status of your order item "<strong>${sanitizeHtml(item.name)}</strong>" (Order ID: ${sanitizeHtml(orderId)}) has been updated to <strong>${sanitizeHtml(status)}</strong>.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a href="${FRONTEND_URL}/chat/${sanitizeHtml(userId)}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">Message Seller</a>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                        <strong>Next Steps:</strong> Contact the seller via chat for any questions or to confirm details like payment and shipping.
                      </p>
                      <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                        <strong>Need Help?</strong> Visit your buyer dashboard or reach out to our support team.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="margin-top: 30px;">
                      <p style="font-size: 14px; color: #64748b; margin: 0;">Happy shopping on BeiFity!</p>
                      <span style="color: #1e40af; font-weight: 600; font-size: 14px; font-weight: 700;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
      const emailSent = await sendEmail(
        buyer.personalInfo.email,
        `Order Status Update - BeiFity.Com`,
        emailContent
      );
      if (!emailSent) {
        logger.warn(`Failed to send status update email to buyer ${order.customerId}`, { orderId, productId });
      } else {
        logger.info(`Status update email sent to buyer ${order.customerId}`, { orderId, productId });
      }
    }

    // Create buyer notification
    const notificationReq = {
      user: { _id: order.customerId },
      body: {
        userId: order.customerId,
        sender: userId,
        type: 'order_status',
        content: `Your order item "${item.name}" (Order ID: ${orderId}) is now ${status}.`,
      },
    };
    const notificationRes = {
      status: code => ({
        json: data => {
          if (!data.success) {
            logger.warn(`Failed to create status notification for buyer ${order.customerId}: ${data.message}`, { orderId });
          }
        },
      }),
    };
    await createNotification(notificationReq, notificationRes);

    await session.commitTransaction();
    logger.info(`Order status updated: ${orderId}, item ${productId} to ${status} by user ${userId}`);
    return res.status(200).json({
      success: true,
      message: 'Status updated successfully',
      data: { orderId: order.orderId, items: order.items },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error updating order status: ${error.message}`, { stack: error.stack, userId: req.user?._id, orderId });
    return res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    session.endSession();
  }
};

/**
 * Get Buyer's Orders
 * @route POST /api/orders/buyer
 * @desc Retrieve orders for a buyer
 * @access Private (requires JWT token)
 */
export const getBuyerOrders = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Get buyer orders failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { customerId } = req.body;
    if (req.user._id.toString() !== customerId) {
      logger.warn(`Get buyer orders failed: User ${req.user._id} attempted to access orders for ${customerId}`);
      return res.status(403).json({ success: false, message: 'Unauthorized to access these orders' });
    }

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      logger.warn(`Get buyer orders failed: Invalid customerId ${customerId}`, { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Valid customerId is required' });
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
      status: order.status,
      items: order.items
        .filter(item => !item.cancelled)
        .map(item => ({
          ...item,
          name: sanitizeHtml(item.name),
          color: sanitizeHtml(item.color),
          size: item.size ? sanitizeHtml(item.size) : undefined,
          seller: {
            id: item.sellerId._id,
            fullname: sanitizeHtml(item.sellerId.personalInfo.fullname || 'Unknown'),
            email: sanitizeHtml(item.sellerId.personalInfo.email || ''),
            phone: sanitizeHtml(item.sellerId.personalInfo.phone || ''),
          },
        })),
      deliveryAddress: {
        ...order.deliveryAddress,
        country: sanitizeHtml(order.deliveryAddress.country),
        county: sanitizeHtml(order.deliveryAddress.county || ''),
        constituency: sanitizeHtml(order.deliveryAddress.constituency || ''),
        nearestTown: sanitizeHtml(order.deliveryAddress.nearestTown || ''),
        email: sanitizeHtml(order.deliveryAddress.email),
        phone: sanitizeHtml(order.deliveryAddress.phone),
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));

    logger.info(`Retrieved ${formattedOrders.length} orders for buyer ${customerId}`);
    return res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: formattedOrders,
    });
  } catch (error) {
    logger.error(`Error fetching buyer orders: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Cancel Order Item
 * @route POST /api/orders/cancel
 * @desc Cancel an item in an order
 * @access Private (requires JWT token)
 */
export const cancelOrderItem = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Cancel order item failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { orderId, itemId, customerId } = req.body;
    if (!orderId || !itemId || !customerId) {
      logger.warn('Cancel order item failed: Missing required fields', { userId: req.user._id });
      return res.status(400).json({ success: false, message: 'orderId, itemId, and customerId are required' });
    }

    if (req.user._id.toString() !== customerId) {
      logger.warn(`Cancel order item failed: User ${req.user._id} attempted to cancel as ${customerId}`);
      return res.status(403).json({ success: false, message: 'Unauthorized to cancel this order' });
    }

    const order = await orderModel.findOne({ orderId, customerId }).session(session);
    if (!order) {
      logger.warn(`Cancel order item failed: Order ${orderId} not found or unauthorized`, { userId: req.user._id });
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized' });
    }

    const item = order.items.find(i => i.productId === itemId);
    if (!item) {
      logger.warn(`Cancel order item failed: Item ${itemId} not found in order ${orderId}`, { userId: req.user._id });
      return res.status(404).json({ success: false, message: 'Item not found in this order' });
    }

    if (item.status !== 'pending') {
      logger.warn(`Cancel order item failed: Item ${itemId} is not pending`, { userId: req.user._id, orderId });
      return res.status(400).json({ success: false, message: 'Only pending items can be cancelled' });
    }

    item.cancelled = true;
    item.status = 'cancelled';

    // Update overall order status if all items are cancelled
    if (order.items.every(i => i.cancelled)) {
      order.status = 'cancelled';
    }

    await order.save({ session });

    // Update analytics
    await userModel.updateOne(
      { _id: customerId },
      { $inc: { 'stats.failedOrdersCount': 1, 'stats.pendingOrdersCount': -1 } },
      { session }
    );
    await userModel.updateOne(
      { _id: item.sellerId },
      { $inc: { 'stats.failedOrdersCount': 1, 'stats.pendingOrdersCount': -1 } },
      { session }
    );
    await ListingModel.updateOne(
      { 'productInfo.productId': item.productId },
      { $inc: { 'analytics.ordersNumber': -1, inventory: item.quantity }, isSold: false },
      { session }
    );

    // Notify seller
    const seller = await userModel.findById(item.sellerId);
    if (seller && seller.personalInfo.email) {
      const emailContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Order Item Cancellation</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
                  <tr>
                    <td>
                      <img src="${FRONTEND_URL}/assets/logo-without-Dr_6ibJh.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Order Cancellation Notice</h2>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Hi ${sanitizeHtml(seller.personalInfo.fullname || 'Seller')},</p>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                        The buyer has cancelled the order item "<strong>${sanitizeHtml(item.name)}</strong>" (Order ID: ${sanitizeHtml(orderId)}). No action is needed, but you can reach out to the buyer if you have questions.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a href="${FRONTEND_URL}/chat/${sanitizeHtml(customerId)}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">Message Buyer</a>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                        <strong>Need Assistance?</strong> Visit your seller dashboard or contact our support team for help.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="margin-top: 30px;">
                      <p style="font-size: 14px; color: #64748b; margin: 0;">Keep selling on BeiFity!</p>
                      <span style="color: #1e40af; font-weight: 600; font-size: 14px; font-weight: 700;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
      const emailSent = await sendEmail(
        seller.personalInfo.email,
        `Order Item Cancellation - BeiFity.Com`,
        emailContent
      );
      if (!emailSent) {
        logger.warn(`Failed to send cancellation email to seller ${item.sellerId}`, { orderId, itemId });
      } else {
        logger.info(`Cancellation email sent to seller ${item.sellerId}`, { orderId, itemId });
      }
    }

    // Create seller notification
    const notificationReq = {
      user: { _id: item.sellerId },
      body: {
        userId: item.sellerId,
        sender: customerId,
        type: 'order_cancellation',
        content: `The buyer cancelled the order item "${item.name}" (Order ID: ${orderId}).`,
      },
    };
    const notificationRes = {
      status: code => ({
        json: data => {
          if (!data.success) {
            logger.warn(`Failed to create cancellation notification for seller ${item.sellerId}: ${data.message}`, { orderId });
          }
        },
      }),
    };
    await createNotification(notificationReq, notificationRes);

    // Notify buyer of cancellation
    const buyer = await userModel.findById(customerId);
    if (buyer && buyer.personalInfo.email) {
      const emailContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Order Item Cancellation Confirmation</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
                  <tr>
                    <td>
                      <img src="${FRONTEND_URL}/assets/logo-without-Dr_6ibJh.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Order Cancellation Confirmed</h2>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Hi ${sanitizeHtml(buyer.personalInfo.fullname || 'Buyer')},</p>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                        You have successfully cancelled the order item "<strong>${sanitizeHtml(item.name)}</strong>" (Order ID: ${sanitizeHtml(orderId)}). The seller has been notified.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <a href="${FRONTEND_URL}/products" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">Explore More Products</a>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                        <strong>Need Assistance?</strong> Visit your buyer dashboard or contact our support team for help.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="margin-top: 30px;">
                      <p style="font-size: 14px; color: #64748b; margin: 0;">Happy shopping on BeiFity!</p>
                      <span style="color: #1e40af; font-weight: 600; font-size: 14px; font-weight: 700;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
      const emailSent = await sendEmail(
        buyer.personalInfo.email,
        `Order Item Cancellation Confirmation - BeiFity.Com`,
        emailContent
      );
      if (!emailSent) {
        logger.warn(`Failed to send cancellation confirmation email to buyer ${customerId}`, { orderId, itemId });
      } else {
        logger.info(`Cancellation confirmation email sent to buyer ${customerId}`, { orderId, itemId });
      }
    }

    // Create buyer cancellation notification
    const buyerNotificationReq = {
      user: { _id: customerId },
      body: {
        userId: customerId,
        sender: customerId,
        type: 'order_cancellation',
        content: `You cancelled the order item "${item.name}" (Order ID: ${orderId}).`,
      },
    };
    const buyerNotificationRes = {
      status: code => ({
        json: data => {
          if (!data.success) {
            logger.warn(`Failed to create cancellation notification for buyer ${customerId}: ${data.message}`, { orderId });
          }
        },
      }),
    };
    await createNotification(buyerNotificationReq, buyerNotificationRes);

    await session.commitTransaction();
    logger.info(`Item ${itemId} cancelled in order ${orderId} by user ${customerId}`);
    res.status(200).json({
      success: true,
      message: 'Item cancelled successfully',
      data: order,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error cancelling item: ${error.message}`, { stack: error.stack, userId: req.user?._id, orderId });
    res.status(500).json({ success: false, message: 'Server error while cancelling item' });
  } finally {
    session.endSession();
  }
};