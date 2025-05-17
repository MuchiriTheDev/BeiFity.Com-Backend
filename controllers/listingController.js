import mongoose from 'mongoose';
import { listingModel } from '../models/Listing.js';
import { userModel } from '../models/User.js';
import { v4 as uuidv4 } from 'uuid';
import webpush from 'web-push';
import sanitizeHtml from 'sanitize-html';
import logger from '../utils/logger.js';
import env from '../config/env.js';
import { sendEmail } from '../utils/sendEmail.js';
import { notificationModel } from '../models/Notifications.js';

// Environment variables
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';

// Reused from notificationController.js
const generateNotificationEmail = (userName, title, body, url) => {
  const sanitizedUserName = sanitizeHtml(userName);
  const sanitizedTitle = sanitizeHtml(title);
  const sanitizedBody = sanitizeHtml(body);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>BeiFity Notification</title>
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
                  <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">${sanitizedTitle}</h2>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">New Notification, ${sanitizedUserName}!</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                    Hi ${sanitizedUserName}, you have a new notification from <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>: ${sanitizedBody}
                  </p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${FRONTEND_URL}${url}" style="display: inline-block; background-color: #1e40af; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-bottom: 30px;">Take Action</a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Need Help?</strong> Contact our support team via the dashboard.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="margin-top: 30px;">
                  <p style="font-size: 14px; color: #64748b; margin: 0;">Stay connected with BeiFity!</p>
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

// Extended notification URL helper
const getNotificationUrl = (type, productId, notificationId) => {
  switch (type.toLowerCase()) {
    case 'listing_created':
    case 'listing_verified':
    case 'listing_rejected':
    case 'listing_sold':
    case 'listing_unsold':
    case 'listing_promoted':
    case 'listing_review':
    case 'listing_inquiry':
    case 'listing_negotiation':
    case 'listing_low_stock':
      return `/dashboard/listings/${productId}`;
    case 'listing_cart_add':
    case 'listing_wishlist_add':
      return `/product/${productId}`;
    case 'guest_data_transferred':
      return '/dashboard/cart';
    case 'admin_pending_listing':
      return '/admin/listings/pending';
    default:
      return '/notifications';
  }
};

// Helper to send notification (simplified from notificationController.js)
export const sendListingNotification = async (
  userId,
  type,
  content,
  productId,
  senderId = null,
  session = null
) => {
  try {
    // Validate user
    const user = await userModel.findById(userId).session(session);
    if (!user) {
      logger.warn(`Send notification failed: User ${userId} not found`, { type, productId });
      return false;
    }

    // Save notification
    const notification = new notificationModel({
      userId,
      type,
      content: sanitizeHtml(content),
      sender: senderId,
    });
    await notification.save({ session });

    // Update analytics
    await userModel.updateOne(
      { _id: userId },
      { $inc: { 'analytics.notificationsReceived': 1 } },
      { session }
    );
    if (senderId) {
      await userModel.updateOne(
        { _id: senderId },
        { $inc: { 'analytics.notificationsSent': 1 } },
        { session }
      );
    }

    // Prepare push notification
    let pushSent = false;
    if (user.pushSubscription) {
      const payload = JSON.stringify({
        title: type.startsWith('listing_') ? 'BeiFity Listing Update' : 'BeiFity.Com',
        body: sanitizeHtml(content),
        icon: `${FRONTEND_URL}/assets/notification-icon.png`,
        badge: `${FRONTEND_URL}/assets/notification-badge.png`,
        vibrate: [200, 100, 200],
        timestamp: Date.now(),
        actions: [
          { action: 'view', title: 'View' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
        data: {
          url: getNotificationUrl(type, productId, notification._id),
          notificationId: notification._id,
        },
      });

      try {
        await webpush.sendNotification(user.pushSubscription, payload);
        pushSent = true;
        logger.info(`Push notification sent to user ${userId}`, { notificationId: notification._id, type });
      } catch (pushError) {
        logger.warn(`Failed to send push notification to user ${userId}: ${pushError.message}`, { notificationId: notification._id, type });
      }
    }

    // Fallback to email
    if (!pushSent && user.personalInfo.email && user.preferences.emailNotifications) {
      const emailContent = generateNotificationEmail(
        user.personalInfo.fullname || 'User',
        `BeiFity ${type.replace('listing_', '').replace('_', ' ').toUpperCase()} Notification`,
        content,
        getNotificationUrl(type, productId, notification._id)
      );
      const emailSent = await sendEmail(
        user.personalInfo.email,
        `BeiFity Notification - ${type.replace('listing_', '').replace('_', ' ')}`,
        emailContent
      );
      if (emailSent) {
        logger.info(`Fallback email notification sent to user ${userId}`, { notificationId: notification._id, type });
      } else {
        logger.warn(`Failed to send fallback email to user ${userId}`, { notificationId: notification._id, type });
      }
    }

    return true;
  } catch (error) {
    logger.error(`Error sending notification: ${error.message}`, { stack: error.stack, userId, type, productId });
    return false;
  }
};


export const addListing = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Add listing failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const {
      productInfo,
      negotiable,
      location,
      AgreedToTerms,
      inventory,
      shippingOptions,
      featured,
    } = req.body;
    const userId = req.user._id.toString();

    if (!productInfo?.name || !productInfo?.price || !AgreedToTerms) {
      logger.warn('Add listing failed: Missing required fields', { userId });
      return res.status(400).json({ success: false, message: 'Missing required fields: product name, price, and AgreedToTerms' });
    }

    if (productInfo?.images && (!Array.isArray(productInfo?.images) || productInfo.images?.length > 5)) {
      logger.warn(`Add listing failed: Invalid or too many images`, { userId, imageCount: productInfo.images?.length });
      return res.status(400).json({
        success: false,
        message: `Images must be an array with up to ${productInfo.images?.length} items`,
      });
    }


    // Validate inventory
    if (typeof inventory !== 'number' || inventory < 1) {
      logger.warn('Add listing failed: Invalid inventory', { userId, inventory });
      return res.status(400).json({ success: false, message: 'Inventory must be a positive number' });
    }

    // Mock payment validation
    const paymentConfirmed = true; // Replace with Stripe/PayPal
    if (!paymentConfirmed) {
      logger.warn('Add listing failed: Payment not confirmed', { userId });
      return res.status(402).json({ success: false, message: 'Payment required to list product' });
    }

    const productId = uuidv4();
    const listingData = {
      productInfo: {
        ...productInfo,
        productId,
        name: sanitizeHtml(productInfo.name.trim()),
        description: sanitizeHtml(productInfo.description?.trim() || ''),
        price: Number(productInfo.price),
        images: productInfo?.images || [],
      },
      seller: {
        sellerId: req.user._id,
        sellerNotes: '',
        responseTime: 0,
        acceptanceRate: 0,
      },
      analytics: {},
      reviews: [],
      negotiable: Boolean(negotiable),
      verified: 'Pending',
      location: sanitizeHtml(location?.trim() || req.user.personalInfo?.location || 'Kenya'),
      isSold: false,
      AgreedToTerms: Boolean(AgreedToTerms),
      featured: Boolean(featured),
      promotedUntil: featured ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
      inventory,
      shippingOptions: shippingOptions || ['Local Pickup', 'Delivery'],
    };

    const listing = new listingModel(listingData);
    await listing.save({ session });

    await userModel.findByIdAndUpdate(
      req.user._id,
      {
        $push: { listings: listing._id },
        $inc: { 'stats.activeListingsCount': 1, 'stats.listingFeesPaid': featured ? 10 : 5 },
      },
      { session }
    );

    // // Notify seller
    await sendListingNotification(
      userId,
      'listing_created',
      `Your listing "${listingData.productInfo.name}" with ${productInfo?.images?.length || 0} image(s) has been created and is pending verification.`,
      productId,
      null,
      session
    );

    // Notify admins
    const admins = await userModel.find({ 'personalInfo.isAdmin': true }).session(session);
    for (const admin of admins) {
      await sendListingNotification(
        admin._id,
        'admin_pending_listing',
        `A new listing "${listingData.productInfo.name}" by ${admin.personalInfo.fullname} is pending verification.`,
        productId,
        req.user._id,
        session
      );
    }

    await session.commitTransaction();
    logger.info(`Listing created with ${productInfo.images?.length || 0} images by user ${userId}: ${productId}`);
    res.status(201).json({
      success: true,
      message: 'Listing created, pending verification',
      data: listing,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error adding listing: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to add listing' });
  } finally {
    session.endSession();
  }
};
/**
 * Verify Listing (Admin Only)
 * @route PUT /api/listings/:productId/verify
 * @desc Admin verifies or rejects a listing with notification to seller
 * @access Private (admin only)
 */
export const verifyListing = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Verify listing failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const adminId = req.user._id.toString();
    const admin = await userModel.findById(adminId).session(session);

    if (!admin.personalInfo?.isAdmin) {
      logger.warn(`Verify listing failed: User ${req.user._id} not admin`);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { productId } = req.params;
    const { status } = req.body;

    if (!['Verified', 'Rejected'].includes(status)) {
      logger.warn(`Verify listing failed: Invalid status ${status}`, { productId });
      return res.status(400).json({ success: false, message: 'Status must be "Verified" or "Rejected"' });
    }

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing) {
      logger.warn(`Verify listing failed: Listing ${productId} not found`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    listing.verified = status;
    await listing.save({ session });

    // Notify seller
    const notificationType = status === 'Verified' ? 'listing_verified' : 'listing_rejected';
    const notificationContent =
      status === 'Verified'
        ? `Your listing "${listing.productInfo.name}" has been verified and is now live!`
        : `Your listing "${listing.productInfo.name}" was rejected. Please review the guidelines.`;
    await sendListingNotification(
      listing.seller.sellerId,
      notificationType,
      notificationContent,
      productId,
      adminId,
      session
    );

    await session.commitTransaction();
    logger.info(`Listing ${productId} ${status.toLowerCase()} by admin ${adminId}`);
    res.status(200).json({
      success: true,
      message: `Listing ${status.toLowerCase()} successfully`,
      data: listing,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error verifying listing: ${error.message}`, { stack: error.stack, productId, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to verify listing' });
  } finally {
    session.endSession();
  }
};

/**
 * Mark Listing as Sold
 * @route PUT /api/listings/:productId/sold
 * @desc Mark a listing as sold with notification to seller
 * @access Private (requires JWT token)
 */
export const markAsSold = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Mark as sold failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { productId } = req.params;
    const userId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing) {
      logger.warn(`Mark as sold failed: Listing ${productId} not found`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    if (listing.seller.sellerId.toString() !== userId) {
      logger.warn(`Mark as sold failed: User ${userId} not authorized`, { productId });
      return res.status(403).json({ success: false, message: 'Unauthorized to mark this listing as sold' });
    }

    if (listing.isSold) {
      logger.warn(`Mark as sold failed: Listing ${productId} already sold`);
      return res.status(400).json({ success: false, message: 'Listing already marked as sold' });
    }

    listing.isSold = true;
    listing.inventory = 0;
    await listing.save({ session });

    await userModel.findByIdAndUpdate(
      listing.seller.sellerId,
      {
        $inc: {
          'stats.activeListingsCount': -1,
          'stats.soldListingsCount': 1,
          'analytics.totalSales.amount': listing.productInfo.price,
          'analytics.salesCount': 1,
        },
        $push: {
          'analytics.totalSales.history': {
            amount: listing.productInfo.price,
            listingId: listing._id,
            date: new Date(),
          },
        },
      },
      { session }
    );

    // Notify seller
    await sendListingNotification(
      userId,
      'listing_sold',
      `Congratulations! Your listing "${listing.productInfo.name}" has been marked as sold.`,
      productId,
      null,
      session
    );

    await session.commitTransaction();
    logger.info(`Listing ${productId} marked as sold by user ${userId}`);
    res.status(200).json({
      success: true,
      message: 'Listing marked as sold',
      data: listing,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error marking listing as sold: ${error.message}`, { stack: error.stack, productId, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to mark listing as sold' });
  } finally {
    session.endSession();
  }
};

/**
 * Add Review to Listing
 * @route POST /api/listings/:productId/reviews
 * @desc Add a review with notification to seller
 * @access Private (requires JWT token)
 */
export const addReview = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Add review failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { productId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user._id.toString();

    if (!rating || !comment) {
      logger.warn('Add review failed: Rating or comment missing', { productId, userId });
      return res.status(400).json({ success: false, message: 'Rating and comment are required' });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      logger.warn(`Add review failed: Invalid rating ${rating}`, { productId, userId });
      return res.status(400).json({ success: false, message: 'Rating must be an integer between 1 and 5' });
    }

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing || listing.verified !== 'Verified' || listing.isSold) {
      logger.warn(`Add review failed: Listing ${productId} not found, not verified, or sold`);
      return res.status(404).json({ success: false, message: 'Listing not found, not verified, or sold' });
    }

    if (listing.seller.sellerId.toString() === userId) {
      logger.warn(`Add review failed: User ${userId} attempted to review own listing`, { productId });
      return res.status(403).json({ success: false, message: 'Sellers cannot review their own products' });
    }

    if (listing.reviews.some((review) => review.user.toString() === userId)) {
      logger.warn(`Add review failed: User ${userId} already reviewed listing`, { productId });
      return res.status(403).json({ success: false, message: 'You have already reviewed this product' });
    }

    const review = {
      user: userId,
      comment: sanitizeHtml(comment.trim()),
      rating,
      createdAt: new Date(),
    };

    listing.reviews.push(review);
    const totalRatings = listing.reviews.reduce((sum, rev) => sum + rev.rating, 0);
    listing.rating = (totalRatings / listing.reviews.length).toFixed(1);
    await listing.save({ session });

    // Notify seller
    await sendListingNotification(
      listing.seller.sellerId,
      'listing_review',
      `A new review (${rating}/5) was added to your listing "${listing.productInfo.name}" by ${req.user.personalInfo.fullname}.`,
      productId,
      userId,
      session
    );

    await session.commitTransaction();
    logger.info(`Review added for listing ${productId} by user ${userId}`);
    res.status(201).json({
      success: true,
      message: 'Review added successfully',
      data: { averageRating: listing.rating },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error adding review: ${error.message}`, { stack: error.stack, productId, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to add review' });
  } finally {
    session.endSession();
  }
};

/**
 * Record Inquiry
 * @route POST /api/listings/:productId/inquiry
 * @desc Record an inquiry with notification to seller
 * @access Private (requires JWT token)
 */
export const recordInquiry = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Record inquiry failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { productId } = req.params;
    const userId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing || listing.verified !== 'Verified' || listing.isSold) {
      logger.warn(`Record inquiry failed: Listing ${productId} not found, not verified, or sold`);
      return res.status(404).json({ success: false, message: 'Listing not found, not verified, or sold' });
    }

    // Rate limiting: Check if user already inquired recently
    const recentInquiry = await NotificationModel.findOne({
      userId: listing.seller.sellerId,
      type: 'listing_inquiry',
      'data.productId': productId,
      sender: userId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    if (recentInquiry) {
      logger.warn(`Record inquiry failed: User ${userId} already inquired recently`, { productId });
      return res.status(429).json({ success: false, message: 'You have already sent an inquiry recently' });
    }

    listing.analytics.inquiries = (listing.analytics.inquiries || 0) + 1;
    await listing.save({ session });

    // Notify seller
    await sendListingNotification(
      listing.seller.sellerId,
      'listing_inquiry',
      `A new inquiry was made on your listing "${listing.productInfo.name}" by ${req.user.personalInfo.fullname}.`,
      productId,
      userId,
      session
    );

    await session.commitTransaction();
    logger.info(`Inquiry recorded for listing ${productId} by user ${userId}`);
    res.status(200).json({ success: true, message: 'Inquiry recorded successfully' });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error recording inquiry: ${error.message}`, { stack: error.stack, productId, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to record inquiry' });
  } finally {
    session.endSession();
  }
};

/**
 * Add to Cart (Analytics Tracking)
 * @route POST /api/listings/:productId/cart
 * @desc Add to cart with notification to seller for trending items
 * @access Private (requires JWT token for users, optional for guests)
 */
export const addToCart = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { productId } = req.params;
    const { userId, guestId } = req.body;

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing || listing.verified !== 'Verified' || listing.isSold || listing.inventory <= 0) {
      logger.warn(`Add to cart failed: Listing ${productId} not available`);
      return res.status(404).json({ success: false, message: 'Listing not available' });
    }

    if (req.user && userId) {
      if (req.user._id.toString() !== userId) {
        logger.warn(`Add to cart failed: User ${req.user._id} attempted to add as ${userId}`);
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }
      if (listing.analytics.cartAdditions.userIds.includes(userId)) {
        logger.debug(`Add to cart skipped: Listing ${productId} already in cart for user ${userId}`);
        return res.status(200).json({ success: true, message: 'Already in cart' });
      }
      listing.analytics.cartAdditions.userIds.push(userId);
      listing.analytics.cartAdditions.total = (listing.analytics.cartAdditions.total || 0) + 1;
      await listing.save({ session });

      await userModel.findByIdAndUpdate(
        listing.seller.sellerId,
        { $inc: { 'analytics.cartAdditions': 1 } },
        { session }
      );

      // Notify seller if cart additions exceed threshold (e.g., 5)
      if (listing.analytics.cartAdditions.total >= 5) {
        await sendListingNotification(
          listing.seller.sellerId,
          'listing_cart_add',
          `Your listing "${listing.productInfo.name}" is trending! It has been added to ${listing.analytics.cartAdditions.total} carts.`,
          productId,
          userId,
          session
        );
      }

      await session.commitTransaction();
      logger.info(`Listing ${productId} added to cart by user ${userId}`);
      res.status(200).json({ success: true, message: 'Added to cart successfully' });
    } else if (guestId) {
      if (listing.analytics.cartAdditions.guestIds.includes(guestId)) {
        logger.debug(`Add to cart skipped: Listing ${productId} already in cart for guest ${guestId}`);
        return res.status(200).json({ success: true, message: 'Already in cart (guest)' });
      }
      listing.analytics.cartAdditions.guestIds.push(guestId);
      listing.analytics.cartAdditions.total = (listing.analytics.cartAdditions.total || 0) + 1;
      await listing.save({ session });

      await userModel.findByIdAndUpdate(
        listing.seller.sellerId,
        { $inc: { 'analytics.cartAdditions': 1 } },
        { session }
      );

      await session.commitTransaction();
      logger.info(`Listing ${productId} added to cart by guest ${guestId}`);
      res.status(200).json({ success: true, message: 'Added to cart (guest)' });
    } else {
      logger.warn('Add to cart failed: User ID or Guest ID required', { productId });
      return res.status(400).json({ success: false, message: 'User ID or Guest ID required' });
    }
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error adding to cart: ${error.message}`, { stack: error.stack, productId, userId, guestId });
    res.status(500).json({ success: false, message: 'Failed to add to cart' });
  } finally {
    session.endSession();
  }
};

/**
 * Remove from Wishlist
 * @route DELETE /api/listings/:productId/wishlist
 * @desc Remove a listing from wishlist
 * @access Private (requires JWT token for users, optional for guests)
 */
export const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const { userId, guestId } = req.body;

    const listing = await listingModel.findOne({ 'productInfo.productId': productId });
    if (!listing || listing.verified !== 'Verified' || listing.isSold)
      return res.status(404).json({ success: false, message: 'Listing not found, not verified, or sold' });

    if (userId) {
      // if (req.user._id.toString() !== userId)
      //   return res.status(403).json({ success: false, message: 'Unauthorized' });
      if (!listing.analytics.wishlist.userIds.includes(userId))
        return res.status(400).json({ success: false, message: 'Not in wishlist' });

      listing.analytics.wishlist.userIds.pull(userId);
      listing.analytics.wishlist.total = Math.max(0, (listing.analytics.wishlist.total || 0) - 1);
      await listing.save();

      await userModel.findByIdAndUpdate(userId, { $pull: { wishlist: listing._id } });
      await userModel.findByIdAndUpdate(listing.seller.sellerId, { $inc: { 'analytics.wishlistCount': -1 } });

      logger.info(`Listing ${productId} removed from wishlist by user ${userId}`);
      return res.status(200).json({ success: true, message: 'Removed from wishlist successfully' });
    }

    if (guestId) {
      if (!listing.analytics.wishlist.guestIds.includes(guestId))
        return res.status(400).json({ success: false, message: 'Not in wishlist (guest)' });

      listing.analytics.wishlist.guestIds.pull(guestId);
      listing.analytics.wishlist.total = Math.max(0, (listing.analytics.wishlist.total || 0) - 1);
      await listing.save();

      await userModel.findByIdAndUpdate(listing.seller.sellerId, { $inc: { 'analytics.wishlistCount': -1 } });

      logger.info(`Listing ${productId} removed from wishlist by guest ${guestId}`);
      return res.status(200).json({ success: true, message: 'Removed from wishlist (guest)' });
    }

    logger.warn('Remove from wishlist failed: Both userId and guestId are missing', { productId });
    return res.status(400).json({ success: false, message: 'Both userId and guestId are missing' });
  } catch (error) {
    logger.error(`Error removing from wishlist: ${error.message}`, { stack: error.stack, productId, userId, guestId });
    res.status(500).json({ success: false, message: 'Failed to remove from wishlist' });
  }
};

/**
 * Add to Wishlist
 * @route POST /api/listings/:productId/wishlist
 * @desc Add to wishlist with notification to seller for trending items
 * @access Private (requires JWT token for users, optional for guests)
 */
export const addToWishlist = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { productId } = req.params;
    const { userId, guestId } = req.body;

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing || listing.verified !== 'Verified' || listing.isSold) {
      logger.warn(`Add to wishlist failed: Listing ${productId} not found, not verified, or sold`);
      return res.status(404).json({ success: false, message: 'Listing not found, not verified, or sold' });
    }

    if (userId) {
     
      if (listing.analytics.wishlist.userIds.includes(userId)) {
        logger.debug(`Add to wishlist skipped: Listing ${productId} already in wishlist for user ${userId}`);
        return res.status(200).json({ success: true, message: 'Already in wishlist' });
      }
      listing.analytics.wishlist.userIds.push(userId);
      listing.analytics.wishlist.total = (listing.analytics.wishlist.total || 0) + 1;
      await listing.save({ session });

      await userModel.findByIdAndUpdate(
        userId,
        { $addToSet: { wishlist: listing._id } },
        { session }
      );
      await userModel.findByIdAndUpdate(
        listing.seller.sellerId,
        { $inc: { 'analytics.wishlistCount': 1 } },
        { session }
      );

      // Notify seller if wishlist additions exceed threshold (e.g., 5)
      if (listing.analytics.wishlist.total >= 5) {
        await sendListingNotification(
          listing.seller.sellerId,
          'listing_wishlist_add',
          `Your listing "${listing.productInfo.name}" is popular! It has been added to ${listing.analytics.wishlist.total} wishlists.`,
          productId,
          userId,
          session
        );
      }

      await session.commitTransaction();
      logger.info(`Listing ${productId} added to wishlist by user ${userId}`);
      return res.status(200).json({ success: true, message: 'Added to wishlist successfully' });
    }

    if (guestId) {
      if (listing.analytics.wishlist.guestIds.includes(guestId)) {
        logger.debug(`Add to wishlist skipped: Listing ${productId} already in wishlist for guest ${guestId}`);
        return res.status(200).json({ success: true, message: 'Already in wishlist (guest)' });
      }
      listing.analytics.wishlist.guestIds.push(guestId);
      listing.analytics.wishlist.total = (listing.analytics.wishlist.total || 0) + 1;
      await listing.save({ session });

      await userModel.findByIdAndUpdate(
        listing.seller.sellerId,
        { $inc: { 'analytics.wishlistCount': 1 } },
        { session }
      );

      await session.commitTransaction();
      logger.info(`Listing ${productId} added to wishlist by guest ${guestId}`);
      return res.status(200).json({ success: true, message: 'Added to wishlist (guest)' });
    }

    logger.warn('Add to wishlist failed: Both userId and guestId are missing', { productId });
    return res.status(400).json({ success: false, message: 'Both userId and guestId are missing' });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error adding to wishlist: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to add to wishlist' });
  } finally {
    session.endSession();
  }
};

/**
 * Update Inventory
 * @route PUT /api/listings/:productId/inventory
 * @desc Update listing inventory with low stock or out of stock notification
 * @access Private (requires JWT token)
 */
export const updateInventory = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Update inventory failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { productId } = req.params;
    const { inventory } = req.body;
    const userId = req.user._id.toString();

    if (typeof inventory !== 'number' || inventory < 0) {
      logger.warn(`Update inventory failed: Invalid inventory ${inventory}`, { productId });
      return res.status(400).json({ success: false, message: 'Inventory must be a non-negative number' });
    }

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing) {
      logger.warn(`Update inventory failed: Listing ${productId} not found`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    if (listing.seller.sellerId.toString() !== userId) {
      logger.warn(`Update inventory failed: User ${userId} not authorized`, { productId });
      return res.status(403).json({ success: false, message: 'Unauthorized to update inventory' });
    }

    const oldInventory = listing.inventory;
    listing.inventory = inventory;
    listing.isSold = inventory === 0;
    await listing.save({ session });

    if (inventory === 0 && oldInventory > 0) {
      await userModel.findByIdAndUpdate(
        listing.seller.sellerId,
        { $inc: { 'stats.activeListingsCount': -1 } },
        { session }
      );
      // Notify seller (out of stock)
      await sendListingNotification(
        userId,
        'listing_low_stock',
        `Your listing "${listing.productInfo.name}" is out of stock.`,
        productId,
        null,
        session
      );
    } else if (inventory > 0 && oldInventory === 0) {
      await userModel.findByIdAndUpdate(
        listing.seller.sellerId,
        { $inc: { 'stats.activeListingsCount': 1 } },
        { session }
      );
    } else if (inventory <= 5 && inventory > 0 && oldInventory > 5) {
      // Notify seller (low stock)
      await sendListingNotification(
        userId,
        'listing_low_stock',
        `Your listing "${listing.productInfo.name}" is running low on stock (${inventory} left).`,
        productId,
        null,
        session
      );
    }

    await session.commitTransaction();
    logger.info(`Inventory updated for listing ${productId} by user ${userId}: ${inventory}`);
    res.status(200).json({
      success: true,
      message: 'Inventory updated successfully',
      data: listing,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error updating inventory: ${error.message}`, { stack: error.stack, productId, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to update inventory' });
  } finally {
    session.endSession();
  }
};

// Other endpoints with notifications (summarized for brevity)
export const markAsUnSold = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    const { productId } = req.params;
    const userId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    if (listing.seller.sellerId.toString() !== userId)
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    if (!listing.isSold) return res.status(400).json({ success: false, message: 'Listing already unsold' });

    listing.isSold = false;
    await listing.save({ session });

    await userModel.findByIdAndUpdate(
      listing.seller.sellerId,
      {
        $inc: {
          'stats.activeListingsCount': 1,
          'stats.soldListingsCount': -1,
          'analytics.totalSales.amount': -listing.productInfo.price,
          'analytics.salesCount': -1,
        },
        $pull: { 'analytics.totalSales.history': { amount: listing.productInfo.price, listingId: listing._id } },
      },
      { session }
    );

    await sendListingNotification(
      userId,
      'listing_unsold',
      `Your listing "${listing.productInfo.name}" has been marked as unsold.`,
      productId,
      null,
      session
    );

    await session.commitTransaction();
    logger.info(`Listing ${productId} marked as unsold by user ${userId}`);
    res.status(200).json({ success: true, message: 'Listing marked as unsold', data: listing });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error marking listing as unsold: ${error.message}`, { stack: error.stack, productId, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to mark listing as unsold' });
  } finally {
    session.endSession();
  }
};

export const promoteListing = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    const { productId } = req.params;
    const { duration } = req.body;
    const userId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    if (listing.seller.sellerId.toString() !== userId)
      return res.status(403).json({ success: false, message: 'Unauthorized' });

    const paymentConfirmed = true; // Replace with Stripe/PayPal
    if (!paymentConfirmed)
      return res.status(402).json({ success: false, message: 'Payment required to promote listing' });

    const promotionDays = Number(duration) || 30;
    if (promotionDays < 1)
      return res.status(400).json({ success: false, message: 'Duration must be a positive number' });

    listing.featured = true;
    listing.promotedUntil = new Date(Date.now() + promotionDays * 24 * 60 * 60 * 1000);
    await listing.save({ session });

    await userModel.findByIdAndUpdate(
      listing.seller.sellerId,
      { $inc: { 'stats.listingFeesPaid': promotionDays * 0.5 } },
      { session }
    );

    await sendListingNotification(
      userId,
      'listing_promoted',
      `Your listing "${listing.productInfo.name}" has been promoted for ${promotionDays} days.`,
      productId,
      null,
      session
    );

    await session.commitTransaction();
    logger.info(`Listing ${productId} promoted by user ${userId} for ${promotionDays} days`);
    res.status(200).json({ success: true, message: 'Listing promoted successfully', data: listing });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error promoting listing: ${error.message}`, { stack: error.stack, productId, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to promote listing' });
  } finally {
    session.endSession();
  }
};

export const recordNegotiation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    const { productId } = req.params;
    const userId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing || listing.verified !== 'Verified' || listing.isSold)
      return res.status(404).json({ success: false, message: 'Listing not found, not verified, or sold' });
    if (!listing.negotiable)
      return res.status(400).json({ success: false, message: 'This listing is not negotiable' });

    listing.analytics.negotiationAttempts = (listing.analytics.negotiationAttempts || 0) + 1;
    await listing.save({ session });

    await sendListingNotification(
      listing.seller.sellerId,
      'listing_negotiation',
      `A negotiation attempt was made on your listing "${listing.productInfo.name}" by ${req.user.personalInfo.fullname}.`,
      productId,
      userId,
      session
    );

    await session.commitTransaction();
    logger.info(`Negotiation attempt recorded for listing ${productId} by user ${userId}`);
    res.status(200).json({ success: true, message: 'Negotiation attempt recorded' });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error recording negotiation: ${error.message}`, { stack: error.stack, productId, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to record negotiation' });
  } finally {
    session.endSession();
  }
};

export const transferGuestData = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    const { userId, guestId, cart, favorites } = req.body;
    if (req.user._id.toString() !== userId)
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    if (!guestId || (!cart?.length && !favorites?.length))
      return res.status(400).json({ success: false, message: 'Guest ID and cart or favorites required' });

    for (const item of cart || []) {
      const listing = await listingModel.findOne({ 'productInfo.productId': item.productId }).session(session);
      if (listing && listing.verified === 'Verified' && !listing.isSold) {
        listing.analytics.cartAdditions.guestIds.pull(guestId);
        listing.analytics.cartAdditions.userIds.push(userId);
        await listing.save({ session });
      }
    }

    for (const productId of favorites || []) {
      const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
      if (listing && listing.verified === 'Verified' && !listing.isSold) {
        listing.analytics.wishlist.guestIds.pull(guestId);
        listing.analytics.wishlist.userIds.push(userId);
        await listing.save({ session });
        await userModel.findByIdAndUpdate(userId, { $addToSet: { wishlist: listing._id } }, { session });
      }
    }

    await sendListingNotification(
      userId,
      'guest_data_transferred',
      `Your guest cart and wishlist data have been transferred to your account.`,
      null,
      null,
      session
    );

    await session.commitTransaction();
    logger.info(`Guest data transferred for user ${userId} from guest ${guestId}`);
    res.status(200).json({ success: true, message: 'Guest data transferred successfully' });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error transferring guest data: ${error.message}`, { stack: error.stack, userId, guestId });
    res.status(500).json({ success: false, message: 'Failed to transfer guest data' });
  } finally {
    session.endSession();
  }
};

// Remaining endpoints (unchanged or minor notification additions)
export const getListings = async (req, res) => {
  try {
    const listings = await listingModel
      .find({ verified: 'Verified', isSold: false })
      .populate('seller.sellerId', 'personalInfo.fullname personalInfo.phone personalInfo.rating')
      .lean();
    logger.info(`Fetched ${listings.length} verified listings`);
    res.status(200).json({ success: true, data: listings });
  } catch (error) {
    logger.error(`Error fetching listings: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to fetch listings' });
  }
};

export const getListingById = async (req, res) => {
  try {
    const { productId } = req.params;
    const listing = await listingModel
      .findOne({ 'productInfo.productId': productId })
      .populate('seller.sellerId', 'personalInfo.fullname personalInfo.phone personalInfo.rating personalInfo.profilePicture')
      .populate('reviews.user', 'personalInfo.fullname personalInfo.profilePicture')
      .lean();
    if (!listing || listing.verified !== 'Verified') {
      logger.warn(`Listing fetch failed: Listing ${productId} not found or not verified`);
      return res.status(404).json({ success: false, message: 'Listing not found or not verified' });
    }
    logger.info(`Listing fetched for product ${productId}`);
    res.status(200).json({ success: true, data: listing });
  } catch (error) {
    logger.error(`Error fetching listing: ${error.message}`, { stack: error.stack, productId });
    res.status(500).json({ success: false, message: 'Failed to fetch listing' });
  }
};

/**
 * Update Listing
 * @route PUT /api/listings/:productId
 * @desc Update a listing, including adding/removing pre-uploaded images
 */
export const updateListing = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Update listing failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { productId } = req.params;
    const { productInfo, negotiable, location, inventory, shippingOptions, sellerNotes, images, removeImageIds } = req.body;
    const userId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing) {
      logger.warn(`Update listing failed: Listing ${productId} not found`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    if (listing.seller.sellerId.toString() !== userId) {
      logger.warn(`Update listing failed: User ${userId} not authorized`, { productId });
      return res.status(403).json({ success: false, message: 'Unauthorized to update this listing' });
    }

    const updateData = {};
    if (productInfo) {
      updateData.productInfo = {
        ...listing.productInfo.toObject(),
        name: sanitizeHtml(productInfo.name?.trim() || listing.productInfo.name),
        description: sanitizeHtml(productInfo.description?.trim() || listing.productInfo.description),
        price: Number(productInfo.price) || listing.productInfo.price,
        productId: listing.productInfo.productId,
        images: listing.productInfo.images || [],
      };
    }
    if (negotiable !== undefined) updateData.negotiable = Boolean(negotiable);
    if (location) updateData.location = sanitizeHtml(location.trim());
    if (typeof inventory === 'number' && inventory >= 0) {
      updateData.inventory = inventory;
      updateData.isSold = inventory === 0;
    }
    if (shippingOptions) updateData.shippingOptions = shippingOptions;
    if (sellerNotes !== undefined) updateData['seller.sellerNotes'] = sanitizeHtml(sellerNotes.trim());
    updateData.updatedAt = new Date();

    let imagesAdded = 0;
    let imagesDeleted = 0;

    // Handle new images
    if (images && Array.isArray(images)) {
      const currentImageCount = updateData.productInfo.images.length;
      if (currentImageCount + images.length > MAX_IMAGES_PER_LISTING) {
        logger.warn(`Update listing failed: Too many images`, { productId, userId, imageCount: currentImageCount + images.length });
        return res.status(400).json({
          success: false,
          message: `Cannot add ${images.length} images. Maximum ${MAX_IMAGES_PER_LISTING} images allowed.`,
        });
      }

      for (const image of images) {
        if (!image.url || !image.public_id) {
          logger.warn('Update listing failed: Invalid image format', { userId, productId });
          return res.status(400).json({ success: false, message: 'Each image must include url and public_id' });
        }
        if (!image.public_id.startsWith(`beifity/users/${userId}/uploads`) && !req.user.personalInfo.isAdmin) {
          logger.warn(`Update listing failed: Image ${image.public_id} not owned by user`, { userId, productId });
          return res.status(403).json({ success: false, message: 'Unauthorized to use this image' });
        }
        updateData.productInfo.images.push(image);
        imagesAdded++;
      }
    }

    // Handle image deletions
    if (removeImageIds && Array.isArray(removeImageIds)) {
      for (const public_id of removeImageIds) {
        const imageIndex = updateData.productInfo.images.findIndex((img) => img.public_id === public_id);
        if (imageIndex === -1) {
          logger.warn(`Update listing failed: Image ${public_id} not found`, { productId, userId });
          continue;
        }
        updateData.productInfo.images.splice(imageIndex, 1);
        imagesDeleted++;
      }
    }

    const updatedListing = await listingModel.findOneAndUpdate(
      { 'productInfo.productId': productId },
      { $set: updateData },
      { new: true, runValidators: true, session }
    );

    if (!updatedListing) {
      logger.warn(`Update listing failed: Update operation failed`, { productId, userId });
      return res.status(500).json({ success: false, message: 'Update failed' });
    }

    // Update user stats for inventory changes
    if (updateData.inventory === 0 && listing.inventory > 0) {
      await userModel.findByIdAndUpdate(
        userId,
        { $inc: { 'stats.activeListingsCount': -1 } },
        { session }
      );
    } else if (updateData.inventory > 0 && listing.inventory === 0) {
      await userModel.findByIdAndUpdate(
        userId,
        { $inc: { 'stats.activeListingsCount': 1 } },
        { session }
      );
    }

    // Update user analytics for images
    if (imagesAdded > 0 || imagesDeleted > 0) {
      await userModel.findByIdAndUpdate(
        userId,
        {
          $inc: {
            'analytics.imagesUploaded': imagesAdded,
            'analytics.imagesDeleted': imagesDeleted,
          },
        },
        { session }
      );
    }

    // Notify seller if images were modified
    if (imagesAdded > 0 || imagesDeleted > 0) {
      const notificationMessage = [
        imagesAdded > 0 ? `Added ${imagesAdded} image(s)` : '',
        imagesDeleted > 0 ? `Removed ${imagesDeleted} image(s)` : '',
      ]
        .filter(Boolean)
        .join(' and ')
        .concat(` for your listing "${listing.productInfo.name}".`);

      await sendListingNotification(
        userId,
        imagesAdded > 0 ? 'listing_image_added' : 'listing_image_removed',
        notificationMessage,
        productId,
        userId,
        session
      );
    }

    await session.commitTransaction();
    logger.info(`Listing updated: ${productId} by user ${userId}, images added: ${imagesAdded}, deleted: ${imagesDeleted}`);
    res.status(200).json({
      success: true,
      message: 'Listing updated successfully',
      data: updatedListing,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error updating listing: ${error.message}`, {
      stack: error.stack,
      productId,
      userId: req.user?._id,
    });
    res.status(500).json({ success: false, message: 'Failed to update listing' });
  } finally {
    session.endSession();
  }
};

export const deleteListing = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    const { productId } = req.params;
    const userId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId });
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
    if (listing.seller.sellerId.toString() !== userId)
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this listing' });

    await userModel.findByIdAndUpdate(listing.seller.sellerId, {
      $pull: { listings: listing._id },
      $inc: { 'stats.activeListingsCount': listing.isSold ? 0 : -1 },
    });

    await listingModel.deleteOne({ 'productInfo.productId': productId });

    logger.info(`Listing deleted: ${productId} by user ${userId}`);
    res.status(200).json({ success: true, message: 'Listing deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting listing: ${error.message}`, { stack: error.stack, productId, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to delete listing' });
  }
};

export const updateViews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { viewerId } = req.body;

    if (!viewerId) return res.status(400).json({ success: false, message: 'Viewer ID required' });

    const listing = await listingModel.findOne({ 'productInfo.productId': productId });
    if (!listing || listing.verified !== 'Verified' || listing.isSold)
      return res.status(404).json({ success: false, message: 'Listing not found, not verified, or sold' });
    if (listing.analytics.views.uniqueViewers.includes(viewerId)) {
      logger.debug(`View already recorded for viewer ${viewerId} on listing ${productId}`);
      return res.status(200).json({ success: true, message: 'View already recorded' });
    }

    listing.analytics.views.uniqueViewers.push(viewerId);
    listing.analytics.views.total = (listing.analytics.views.total || 0) + 1;
    await listing.save();

    await userModel.findByIdAndUpdate(listing.seller.sellerId, { $inc: { 'analytics.listingViews': 1 } });

    logger.info(`View recorded for listing ${productId} by viewer ${viewerId}`);
    res.status(200).json({ success: true, message: 'View recorded successfully' });
  } catch (error) {
    logger.error(`Error updating views: ${error.message}`, { stack: error.stack, productId });
    res.status(500).json({ success: false, message: 'Failed to update views' });
  }
};

export const removeToCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const { userId, guestId } = req.body;

    const listing = await listingModel.findOne({ 'productInfo.productId': productId });
    if (!listing || listing.verified !== 'Verified' || listing.isSold || listing.inventory <= 0)
      return res.status(404).json({ success: false, message: 'Listing not available' });

    if (req.user && userId) {
      if (req.user._id.toString() !== userId)
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      if (!listing.analytics.cartAdditions.userIds.includes(userId))
        return res.status(400).json({ success: false, message: 'Not in cart' });

      listing.analytics.cartAdditions.userIds.pull(userId);
      listing.analytics.cartAdditions.total = Math.max(0, (listing.analytics.cartAdditions.total || 0) - 1);
      await listing.save();

      await userModel.findByIdAndUpdate(listing.seller.sellerId, { $inc: { 'analytics.cartAdditions': -1 } });

      logger.info(`Listing ${productId} removed from cart by user ${userId}`);
      res.status(200).json({ success: true, message: 'Removed from cart successfully' });
    } else if (guestId) {
      if (!listing.analytics.cartAdditions.guestIds.includes(guestId))
        return res.status(400).json({ success: false, message: 'Not in cart (guest)' });

      listing.analytics.cartAdditions.guestIds.pull(guestId);
      listing.analytics.cartAdditions.total = Math.max(0, (listing.analytics.cartAdditions.total || 0) - 1);
      await listing.save();

      await userModel.findByIdAndUpdate(listing.seller.sellerId, { $inc: { 'analytics.cartAdditions': -1 } });

      logger.info(`Listing ${productId} removed from cart by guest ${guestId}`);
      res.status(200).json({ success: true, message: 'Removed from cart (guest)' });
    } else {
      logger.warn('Remove from cart failed: User ID or Guest ID required', { productId });
      return res.status(400).json({ success: false, message: 'User ID or Guest ID required' });
    }
  } catch (error) {
    logger.error(`Error removing from cart: ${error.message}`, { stack: error.stack, productId, userId, guestId });
    res.status(500).json({ success: false, message: 'Failed to remove from cart' });
  }
};


export const shareListing = async (req, res) => {
  try {
    const { productId } = req.params;
    const { platform } = req.body;

    if (!platform) return res.status(400).json({ success: false, message: 'Platform required' });

    const listing = await listingModel.findOne({ 'productInfo.productId': productId });
    if (!listing || listing.verified !== 'Verified' || listing.isSold)
      return res.status(404).json({ success: false, message: 'Listing not found, not verified, or sold' });

    const currentShares = listing.analytics.shared?.platforms?.[platform] || 0;
    listing.analytics.shared = {
      total: (listing.analytics.shared?.total || 0) + 1,
      platforms: { ...listing.analytics.shared?.platforms, [platform]: currentShares + 1 },
    };
    await listing.save();

    const user = await userModel.findById(listing.seller.sellerId);
    const userShares = user.analytics.shares?.platforms?.[platform] || 0;
    await userModel.findByIdAndUpdate(listing.seller.sellerId, {
      $inc: { 'analytics.shares.total': 1 },
      $set: { [`analytics.shares.platforms.${platform}`]: userShares + 1 },
    });

    logger.info(`Listing ${productId} shared on ${platform}`);
    res.status(200).json({ success: true, message: `Listing shared on ${platform}` });
  } catch (error) {
    logger.error(`Error sharing listing: ${error.message}`, { stack: error.stack, productId });
    res.status(500).json({ success: false, message: 'Failed to share listing' });
  }
};

export const featureListing = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!req.user.personalInfo?.isAdmin)
      return res.status(403).json({ success: false, message: 'Admin access required' });

    const { productId } = req.params;
    const { featured } = req.body;
    const adminId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

    listing.featured = Boolean(featured);
    listing.promotedUntil = featured ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
    await listing.save({ session });

    await sendListingNotification(
      listing.seller.sellerId,
      'listing_promoted',
      `Your listing "${listing.productInfo.name}" has been ${featured ? 'featured' : 'unfeatured'} by an admin.`,
      productId,
      adminId,
      session
    );

    await session.commitTransaction();
    logger.info(`Listing ${productId} ${featured ? 'featured' : 'unfeatured'} by admin ${adminId}`);
    res.status(200).json({
      success: true,
      message: `Listing ${featured ? 'featured' : 'unfeatured'} successfully`,
      data: listing,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error featuring listing: ${error.message}`, { stack: error.stack, productId, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to feature listing' });
  } finally {
    session.endSession();
  }
};

export const updateResponseTime = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!req.user.personalInfo?.isAdmin)
      return res.status(403).json({ success: false, message: 'Admin access required' });

    const { productId } = req.params;
    const { responseTime } = req.body;

    if (typeof responseTime !== 'number' || responseTime < 0)
      return res.status(400).json({ success: false, message: 'Response time must be a non-negative number' });

    const listing = await listingModel.findOneAndUpdate(
      { 'productInfo.productId': productId },
      { 'seller.responseTime': responseTime },
      { new: true }
    );
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

    const sellerListings = await listingModel.find({ 'seller.sellerId': listing.seller.sellerId });
    const totalResponseTime = sellerListings.reduce((sum, l) => sum + l.seller.responseTime, 0);
    await userModel.findByIdAndUpdate(listing.seller.sellerId, {
      'analytics.responseTimeAvg': sellerListings.length ? totalResponseTime / sellerListings.length : 0,
    });

    logger.info(`Response time updated for listing ${productId} by admin ${req.user._id}`);
    res.status(200).json({ success: true, message: 'Response time updated', data: listing });
  } catch (error) {
    logger.error(`Error updating response time: ${error.message}`, { stack: error.stack, productId, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to update response time' });
  }
};

export const updateAcceptanceRate = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!req.user.personalInfo?.isAdmin)
      return res.status(403).json({ success: false, message: 'Admin access required' });

    const { productId } = req.params;
    const { acceptanceRate } = req.body;

    if (typeof acceptanceRate !== 'number' || acceptanceRate < 0 || acceptanceRate > 100)
      return res.status(400).json({ success: false, message: 'Acceptance rate must be between 0 and 100' });

    const listing = await listingModel.findOneAndUpdate(
      { 'productInfo.productId': productId },
      { 'seller.acceptanceRate': acceptanceRate },
      { new: true }
    );
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

    logger.info(`Acceptance rate updated for listing ${productId} by admin ${req.user._id}`);
    res.status(200).json({ success: true, message: 'Acceptance rate updated', data: listing });
  } catch (error) {
    logger.error(`Error updating acceptance rate: ${error.message}`, { stack: error.stack, productId, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to update acceptance rate' });
  }
};

export const updateConversionRate = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!req.user.personalInfo?.isAdmin)
      return res.status(403).json({ success: false, message: 'Admin access required' });

    const { productId } = req.params;
    const { conversionRate } = req.body;

    if (typeof conversionRate !== 'number' || conversionRate < 0 || conversionRate > 100)
      return res.status(400).json({ success: false, message: 'Conversion rate must be between 0 and 100' });

    const listing = await listingModel.findOneAndUpdate(
      { 'productInfo.productId': productId },
      { 'analytics.conversionRate': conversionRate },
      { new: true }
    );
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });

    logger.info(`Conversion rate updated for listing ${productId} by admin ${req.user._id}`);
    res.status(200).json({ success: true, message: 'Conversion rate updated', data: listing });
  } catch (error) {
    logger.error(`Error updating conversion rate: ${error.message}`, { stack: error.stack, productId, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to update conversion rate' });
  }
};

export const getSellerListings = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const listings = await listingModel
      .find({ 'seller.sellerId': sellerId, verified: 'Verified', isSold: false })
      .populate('seller.sellerId', 'personalInfo.fullname personalInfo.phone')
      .lean();
    if (!listings.length)
      return res.status(404).json({ success: false, message: 'No verified listings found for this seller' });
    logger.info(`Fetched ${listings.length} listings for seller ${sellerId}`);
    res.status(200).json({ success: true, data: listings });
  } catch (error) {
    logger.error(`Error fetching seller listings: ${error.message}`, { stack: error.stack, sellerId });
    res.status(500).json({ success: false, message: 'Failed to fetch seller listings' });
  }
};

export const getPendingListings = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    const adminId = req.user._id.toString();
    const admin = await userModel.findById(adminId);
    if (!admin || !admin.personalInfo?.isAdmin)
      return res.status(403).json({ success: false, message: 'Admin access required' });

    const listings = await listingModel
      .find({ verified: 'Pending' })
      .populate('seller.sellerId', 'personalInfo.fullname personalInfo.phone')
      .lean();
    logger.info(`Fetched ${listings.length} pending listings by admin ${req.user._id}`);
    res.status(200).json({ success: true, data: listings });
  } catch (error) {
    logger.error(`Error fetching pending listings: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to fetch pending listings' });
  }
};

export const getFeaturedListings = async (req, res) => {
  try {
    const listings = await listingModel
      .find({ featured: true, verified: 'Verified', isSold: false })
      .populate('seller.sellerId', 'personalInfo.fullname personalInfo.phone')
      .lean();
    logger.info(`Fetched ${listings.length} featured listings`);
    res.status(200).json({ success: true, data: listings });
  } catch (error) {
    logger.error(`Error fetching featured listings: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to fetch featured listings' });
  }
};

export const getListingsNear = async (req, res) => {
  try {
    const { lat, lng, maxDistance = 10000 } = req.query;
    if (!lat || !lng)
      return res.status(400).json({ success: false, message: 'Latitude and longitude required' });

    const listings = await listingModel
      .find({
        'seller.sellerId': {
          $in: await userModel
            .find({
              'personalInfo.location.coordinates': {
                $near: {
                  $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
                  $maxDistance: parseInt(maxDistance),
                },
              },
            })
            .distinct('_id'),
        },
        verified: 'Verified',
        isSold: false,
      })
      .populate('seller.sellerId', 'personalInfo.fullname personalInfo.phone personalInfo.location')
      .lean();

    logger.info(`Fetched ${listings.length} listings near [${lat}, ${lng}]`);
    res.status(200).json({ success: true, data: listings });
  } catch (error) {
    logger.error(`Error fetching nearby listings: ${error.message}`, { stack: error.stack, lat, lng });
    res.status(500).json({ success: false, message: 'Failed to fetch nearby listings' });
  }
};