import webpush from 'web-push';
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import { userModel } from '../models/User.js';
import logger from '../utils/logger.js';
import { sendEmail } from '../utils/sendEmail.js';
import { notificationModel } from '../models/Notifications.js';

// Load environment variables
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.beifity.com';

// Email Template for Notification Fallback
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

// Helper function to determine the URL based on notification type
const getNotificationUrl = (type, sender, notificationId) => {
  switch (type.toLowerCase()) {
    case 'message':
      return `/chat/${sender}`; // Sender is userId
    case 'order':
      return `/dashboard/orders`;
    case 'new_product':
      return `/product/${sender}`; // Sender is productId
    case 'report':
      return `/dashboard/reports`;
    case 'report_status':
      return `/dashboard/reports/${notificationId}`;
    default:
      return '/notifications';
  }
};

/**
 * Save Push Subscription
 * @route POST /api/notifications/subscribe
 * @desc Save a user's push notification subscription
 * @access Private (requires JWT token)
 */
export const savePushSubscription = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Save push subscription failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { subscription } = req.body;
    const userId = req.user._id.toString();

    // Validate input
    if (!subscription || typeof subscription !== 'object') {
      logger.warn(`Save push subscription failed: Invalid subscription data`, { userId });
      return res.status(400).json({ success: false, message: 'Invalid subscription data' });
    }

    // Validate user
    const user = await userModel.findById(userId).session(session);
    if (!user) {
      logger.warn(`Save push subscription failed: User ${userId} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Save subscription
    user.pushSubscription = subscription;
    await user.save({ session });

    await session.commitTransaction();
    logger.info(`Push subscription saved for user ${userId}`);
    res.status(200).json({ success: true, message: 'Subscription saved successfully' });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error saving push subscription: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Server error while saving subscription' });
  } finally {
    session.endSession();
  }
};

/**
 * Create Notification
 * @route POST /api/notifications
 * @desc Create and send a notification to a user
 * @access Private (requires JWT token)
 */
export const createNotification = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Create notification failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { userId, type, content, sender } = req.body;
    const requesterId = req.user._id.toString();

    // Validate inputs
    const validTypes = ['message', 'order', 'new_product', 'report', 'report_status'];
    if (!userId || !type || !content) {
      logger.warn(`Create notification failed: Missing required fields`, { requesterId });
      return res.status(400).json({ success: false, message: 'userId, type, and content are required' });
    }
    if (!validTypes.includes(type)) {
      logger.warn(`Create notification failed: Invalid type ${type}`, { requesterId });
      return res.status(400).json({ success: false, message: `Type must be one of ${validTypes.join(', ')}` });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Create notification failed: Invalid userId ${userId}`, { requesterId });
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }
    if (sender && !mongoose.Types.ObjectId.isValid(sender)) {
      logger.warn(`Create notification failed: Invalid sender ${sender}`, { requesterId });
      return res.status(400).json({ success: false, message: 'Invalid sender' });
    }

    // Validate users
    const user = await userModel.findById(userId).session(session);
    if (!user) {
      logger.warn(`Create notification failed: User ${userId} not found`, { requesterId });
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    let senderDetails = null;
    if (sender) {
      senderDetails = await userModel.findById(sender).session(session);
      if (!senderDetails) {
        logger.warn(`Create notification failed: Sender ${sender} not found`, { requesterId });
        return res.status(404).json({ success: false, message: 'Sender not found' });
      }
    }

    // Authorization: Only admins or sender can create notifications
    if (!req.user.personalInfo.isAdmin && sender !== requesterId) {
      logger.warn(`Create notification failed: User ${requesterId} unauthorized to send as ${sender || 'system'}`, { userId });
      return res.status(403).json({ success: false, message: 'Unauthorized to create notification' });
    }

    // Save notification
    const notification = new notificationModel({
      userId,
      type,
      content: sanitizeHtml(content),
      sender: sender || requesterId,
    });
    await notification.save({ session });

    // Update user analytics
    await userModel.updateOne(
      { _id: userId },
      { $inc: { 'analytics.notificationsReceived': 1 } },
      { session }
    );
    if (sender) {
      await userModel.updateOne(
        { _id: sender },
        { $inc: { 'analytics.notificationsSent': 1 } },
        { session }
      );
    }

    // Prepare push notification
    let pushSent = false;
    if (user.pushSubscription) {
      const payload = JSON.stringify({
        title: type === 'message' && senderDetails ? senderDetails.personalInfo.fullname : 'BeiFity.Com',
        body: sanitizeHtml(content),
        icon: `${FRONTEND_URL}/assets/notification-icon.png`,
        badge: `${FRONTEND_URL}/assets/notification-badge.png`,
        vibrate: [200, 100, 200],
        timestamp: Date.now(),
        actions: [
          { action: 'reply', title: 'Reply' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
        data: {
          url: getNotificationUrl(type, sender || notification._id, notification._id),
          notificationId: notification._id,
        },
      });

      try {
        await webpush.sendNotification(user.pushSubscription, payload);
        pushSent = true;
        logger.info(`Push notification sent to user ${userId}`, { notificationId: notification._id });
      } catch (pushError) {
        logger.warn(`Failed to send push notification to user ${userId}: ${pushError.message}`, { notificationId: notification._id });
      }
    }

    // Fallback to email if push fails or no subscription
    if (!pushSent && user.personalInfo.email && user.preferences.emailNotifications) {
      const emailContent = generateNotificationEmail(
        user.personalInfo.fullname || 'User',
        type === 'message' && senderDetails ? `New Message from ${senderDetails.personalInfo.fullname}` : `BeiFity ${type.charAt(0).toUpperCase() + type.slice(1)} Notification`,
        content,
        getNotificationUrl(type, sender || notification._id, notification._id)
      );
      const emailSent = await sendEmail(
        user.personalInfo.email,
        `BeiFity Notification - ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        emailContent
      );
      if (emailSent) {
        logger.info(`Fallback email notification sent to user ${userId}`, { notificationId: notification._id });
      } else {
        logger.warn(`Failed to send fallback email to user ${userId}`, { notificationId: notification._id });
      }
    }

    await session.commitTransaction();
    logger.info(`Notification created for user ${userId} by ${requesterId}`, { notificationId: notification._id });
    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      data: notification,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error creating notification: ${error.message}`, { stack: error.stack, userId: req.body.userId, requesterId: req.user?._id });
    res.status(500).json({ success: false, message: 'Server error while creating notification' });
  } finally {
    session.endSession();
  }
};

/**
 * Get Notifications
 * @route GET /api/notifications/:userId
 * @desc Retrieve notifications for a user with pagination and filtering
 * @access Private (requires JWT token)
 */
export const getNotifications = async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 20, isRead, type } = req.query;

  try {
    if (!req.user) {
      logger.warn('Get notifications failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (req.user._id.toString() !== userId && !req.user.personalInfo.isAdmin) {
      logger.warn(`Get notifications failed: User ${req.user._id} unauthorized to access notifications for ${userId}`);
      return res.status(403).json({ success: false, message: 'Unauthorized to access these notifications' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Get notifications failed: Invalid userId ${userId}`, { requesterId: req.user._id });
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    const query = { userId };
    if (isRead !== undefined) query.isRead = isRead === 'true';
    if (type) query.type = type;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [notifications, total] = await Promise.all([
      NotificationModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('sender', 'personalInfo.fullname personalInfo.email')
        .lean(),
      NotificationModel.countDocuments(query),
    ]);

    logger.info(`Retrieved ${notifications.length} notifications for user ${userId} by ${req.user._id}`, { page, limit });
    res.status(200).json({
      success: true,
      message: 'Notifications retrieved successfully',
      data: {
        notifications,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    logger.error(`Error fetching notifications: ${error.message}`, { stack: error.stack, userId, requesterId: req.user?._id });
    res.status(500).json({ success: false, message: 'Server error while fetching notifications' });
  }
};

/**
 * Mark Notification as Read
 * @route PATCH /api/notifications/:notificationId/read
 * @desc Mark a single notification as read
 * @access Private (requires JWT token)
 */
export const markAsRead = async (req, res) => {
  const { notificationId } = req.params;

  try {
    if (!req.user) {
      logger.warn('Mark notification as read failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      logger.warn(`Mark notification as read failed: Invalid notificationId ${notificationId}`, { requesterId: req.user._id });
      return res.status(400).json({ success: false, message: 'Invalid notificationId' });
    }

    const notification = await NotificationModel.findById(notificationId);
    if (!notification) {
      logger.warn(`Mark notification as read failed: Notification ${notificationId} not found`, { requesterId: req.user._id });
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    if (notification.userId.toString() !== req.user._id.toString() && !req.user.personalInfo.isAdmin) {
      logger.warn(`Mark notification as read failed: User ${req.user._id} unauthorized for notification ${notificationId}`);
      return res.status(403).json({ success: false, message: 'Unauthorized to mark this notification' });
    }

    if (notification.isRead) {
      logger.info(`Notification ${notificationId} already marked as read for user ${req.user._id}`);
      return res.status(200).json({
        success: true,
        message: 'Notification already marked as read',
        data: notification,
      });
    }

    notification.isRead = true;
    await notification.save();

    logger.info(`Notification ${notificationId} marked as read for user ${req.user._id}`);
    res.status(200).json({
      success: true,
      message: 'Notification marked as read successfully',
      data: notification,
    });
  } catch (error) {
    logger.error(`Error marking notification as read: ${error.message}`, { stack: error.stack, notificationId, requesterId: req.user?._id });
    res.status(500).json({ success: false, message: 'Server error while marking notification as read' });
  }
};

/**
 * Mark All Notifications as Read
 * @route PATCH /api/notifications/mark-all-read
 * @desc Mark all or specific notifications as read for a user
 * @access Private (requires JWT token)
 */
export const markAllAsRead = async (req, res) => {
  const { userId, notificationIds } = req.body;

  try {
    if (!req.user) {
      logger.warn('Mark all notifications as read failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.user._id.toString() !== userId && !req.user.personalInfo.isAdmin) {
      logger.warn(`Mark all notifications as read failed: User ${req.user._id} unauthorized for user ${userId}`);
      return res.status(403).json({ success: false, message: 'Unauthorized to mark these notifications' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Mark all notifications as read failed: Invalid userId ${userId}`, { requesterId: req.user._id });
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    if (notificationIds && (!Array.isArray(notificationIds) || notificationIds.some(id => !mongoose.Types.ObjectId.isValid(id)))) {
      logger.warn(`Mark all notifications as read failed: Invalid notificationIds`, { requesterId: req.user._id });
      return res.status(400).json({ success: false, message: 'Invalid notificationIds' });
    }

    let query = { userId, isRead: false };
    if (notificationIds && notificationIds.length > 0) {
      query._id = { $in: notificationIds };
    }

    const updatedNotifications = await NotificationModel.updateMany(
      query,
      { $set: { isRead: true } }
    );

    if (updatedNotifications.matchedCount === 0) {
      logger.info(`No unread notifications found to mark as read for user ${userId}`, { requesterId: req.user._id });
      return res.status(200).json({
        success: true,
        message: 'No unread notifications found to mark as read',
      });
    }

    logger.info(`Marked ${updatedNotifications.modifiedCount} notifications as read for user ${userId}`, { requesterId: req.user._id });
    res.status(200).json({
      success: true,
      message: `Marked ${updatedNotifications.modifiedCount} notifications as read successfully`,
      data: { modifiedCount: updatedNotifications.modifiedCount },
    });
  } catch (error) {
    logger.error(`Error marking all notifications as read: ${error.message}`, { stack: error.stack, userId, requesterId: req.user?._id });
    res.status(500).json({ success: false, message: 'Server error while marking notifications as read' });
  }
};