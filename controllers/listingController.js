// controllers/listingController.js
import mongoose from 'mongoose';
import { listingModel } from '../models/Listing.js';
import { userModel } from '../models/User.js';
import { v4 as uuidv4 } from 'uuid';
import sanitizeHtml from 'sanitize-html';
import logger from '../utils/logger.js';
import { notificationModel } from '../models/Notifications.js';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { sendEmail } from '../utils/sendEmail.js';
import env from '../config/env.js';
import { v2 as cloudinary } from 'cloudinary';
import { orderModel } from '../models/Order.js';
import { sendNotification } from './notificationController.js';

// Add Listing
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
        message: `Images must be an array with up to 5 items`,
      });
    }

    if (typeof inventory !== 'number' || inventory < 1) {
      logger.warn('Add listing failed: Invalid inventory', { userId, inventory });
      return res.status(400).json({ success: false, message: 'Inventory must be a positive number' });
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
        category: productInfo?.category || '',
        subCategory: productInfo?.subCategory || '',
        tags: productInfo?.tags || [],
        sizes: productInfo?.sizes || [],
        colors: productInfo?.colors || [],
        usageDuration: productInfo?.usageDuration || 'Brand New (0-1 months)',
        condition: productInfo?.condition || 'New',
        brand: productInfo?.brand || '',
        model: productInfo?.model || '',
        warranty: productInfo?.warranty || 'No Warranty',
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
      verified: 'Pending', // Initially set to Pending until AI verification
      location: sanitizeHtml(location?.trim() || 'Kenya'),
      isSold: false,
      AgreedToTerms: Boolean(AgreedToTerms),
      featured: Boolean(featured),
      promotedUntil: featured ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
      inventory,
      shippingOptions: shippingOptions || ['Local Pickup', 'Delivery'],
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Set expiration to 30 days
      isActive: true, // Initially active
    };

    // Initialize Google Gemini
    const genAI = new GoogleGenerativeAI("AIzaSyBWq3sDh4cvy9Wupo2ASBPhrCCk41WGlpM");
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Prepare prompt for AI verification and findings
    const prompt = `
      You are an AI assistant for a marketplace platform. Your task is to verify a new product listing for compliance with platform guidelines and generate insights about potential risks, pricing fairness, and listing quality.

      **Listing Data**:
      - Product Name: ${listingData.productInfo.name}
      - Description: ${listingData.productInfo.description}
      - Price: KES ${listingData.productInfo.price}
      - Category: ${listingData.productInfo.category}
      - Subcategory: ${listingData.productInfo.subCategory}
      - Tags: ${JSON.stringify(listingData.productInfo.tags)}
      - Images: ${listingData.productInfo.images.length} images provided
      - Condition: ${listingData.productInfo.condition}
      - Usage Duration: ${listingData.productInfo.usageDuration}
      - Brand: ${listingData.productInfo.brand}
      - Model: ${listingData.productInfo.model}
      - Warranty: ${listingData.productInfo.warranty}
      - Inventory: ${listingData.inventory}
      - Negotiable: ${listingData.negotiable}
      - Location: ${listingData.location}
      - Shipping Options: ${JSON.stringify(listingData.shippingOptions)}

      **Platform Guidelines**:
      - Listings must not contain prohibited items (e.g., weapons, drugs, counterfeit goods).
      - Product descriptions free of offensive content.
      - Pricing should be reasonable relative to the product's condition and market value.
      - Images must be relevant and appropriate (no explicit or misleading content).
      - Listings must comply with local laws in ${listingData.location}.

      **Instructions**:
      - Verify if the listing complies with platform guidelines.
      - Identify potential risks (e.g., vague descriptions, suspicious pricing, prohibited items).
      - Assess pricing fairness based on condition, brand, and category.
      - Evaluate listing quality (e.g., completeness of information, image count).
      - Provide actionable insights for the seller to improve the listing.
      - And most imortantly I want you to approve these by a 90% success rate.
      - Return a JSON object with:
        {
          "verified": "Verified" | "Rejected",
          "findings": [
            {
              "title": "Insight title",
              "description": "Detailed description of the issue or observation",
              "action": "Recommended action to address the issue or improve the listing",
              "priority": "high" | "medium" | "low"
            },
            ...
          ]
        }
    `;

    // Perform AI verification
    const result = await model.generateContent({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1500,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });

    let aiResponse;
    try {
      const rawResponse = result.response.text().replace(/```json\s*|\s*```/g, '').trim();
      aiResponse = JSON.parse(rawResponse);
    } catch (error) {
      logger.error(`Failed to parse AI response for listing ${productId}: ${error.message}`);
      aiResponse = {
        verified: 'Rejected',
        findings: [
          {
            title: 'AI Verification Error',
            description: 'Unable to process listing due to an error in AI verification.',
            action: 'Manually review the listing for compliance.',
            priority: 'high',
          },
        ],
      };
    }

    // Update listing data with AI verification result and findings
    listingData.verified = aiResponse.verified;
    listingData.aiFindings = aiResponse.findings;

    const listing = new listingModel(listingData);
    await listing.save({ session });

    await userModel.findByIdAndUpdate(
      req.user._id,
      {
        $push: { listings: listing._id },
        $inc: { 'stats.activeListingsCount': 1 },
      },
      { session }
    );

    // Notify seller about listing status and findings
    const findingsSummary = aiResponse.findings
      .map((finding) => `- ${finding.title} (${finding.priority}): ${finding.description} [Action: ${finding.action}]`)
      .join('\n');
    await sendNotification(
      userId,
      aiResponse.verified === 'Verified' ? 'listing_verified' : 'listing_rejected',
      `Your listing "${listingData.productInfo.name}" has been ${aiResponse.verified.toLowerCase()}. ${
        aiResponse.verified === 'Verified'
          ? 'It is now live!'
          : 'Please review the following findings and update your listing:\n' + findingsSummary
      }`,
      null,
      session
    );

    // If rejected, notify admins for manual review
    if (aiResponse.verified === 'Rejected') {
      const admins = await userModel.find({ 'personalInfo.isAdmin': true }).session(session);
      for (const admin of admins) {
        await sendNotification(
          admin._id,
          'admin_pending_listing',
          `Listing "${listingData.productInfo.name}" by user ${req.user.personalInfo.fullname} was rejected by AI. Findings:\n${findingsSummary}`,
          req.user._id,
          session
        );
      }
    }

    await session.commitTransaction();
    logger.info(`Listing created by user ${userId}: ${productId}, AI verification: ${aiResponse.verified}`);
    res.status(201).json({
      success: true,
      message: `Listing ${aiResponse.verified.toLowerCase()}${aiResponse.verified === 'Verified' ? ' and is now live' : ', please review findings'}`,
      data: { listing, aiFindings: aiResponse.findings },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error adding listing: ${error.message}`, { stack: error.stack});
    res.status(500).json({ success: false, message: 'Failed to add listing' });
  } finally {
    session.endSession();
  }
};
// Renew Listing
export const renewListing = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const { productId } = req.params;
  const userId = req.user._id.toString();
  try {
    if (!req.user) {
      logger.warn('Renew listing failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
   

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing) {
      logger.warn(`Renew listing failed: Listing ${productId} not found`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }
    if (listing.seller.sellerId.toString() !== userId) {
      logger.warn(`Renew listing failed: User ${userId} not authorized`, { productId });
      return res.status(403).json({ success: false, message: 'Unauthorized to renew this listing' });
    }
    if (listing.isActive) {
      logger.warn(`Renew listing failed: Listing ${productId} is already active`);
      return res.status(400).json({ success: false, message: 'Listing is already active' });
    }

    listing.isActive = true;
    listing.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await listing.save({ session });

    await userModel.findByIdAndUpdate(
      userId,
      { $inc: { 'stats.activeListingsCount': 1 } },
      { session }
    );

    await sendNotification(
      userId,
      'listing_renewed',
      `Your listing "${listing.productInfo.name}" has been renewed and is now active for another 30 days.`,
      null,
      session
    );

    await session.commitTransaction();
    logger.info(`Listing ${productId} renewed by user ${userId}`);
    res.status(200).json({
      success: true,
      message: 'Listing renewed successfully',
      data: listing,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error renewing listing: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to renew listing' });
  } finally {
    session.endSession();
  }
};

// Mark Listing as Sold
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

    const user = await userModel.findById(userId).session(session);

    if (listing.seller.sellerId.toString() !== userId ) {
      if(!user.personalInfo.isAdmin) {
        logger.warn(`Mark as sold failed: User ${userId} not authorized`, { productId });
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }
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
    await sendNotification(
      userId,
      'listing_sold',
      `Congratulations! Your listing "${listing.productInfo.name}" has been marked as sold.`,
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
    logger.error(`Error marking listing as sold: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to mark listing as sold' });
  } finally {
    session.endSession();
  }
};

// Add Review to Listing
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
    await listing.save({ session });

    const reviewer = await userModel.findById(userId).session(session);

    // Notify seller
    await sendNotification(
      listing.seller.sellerId,
      'listing_review',
      `A new review (${rating}/5) was added to your listing "${listing.productInfo.name}" by ${reviewer.personalInfo.fullname}.`,
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
    logger.error(`Error adding review: ${error.message}`, { stack: error.stack,  });
    res.status(500).json({ success: false, message: 'Failed to add review' });
  } finally {
    session.endSession();
  }
};

// Record Inquiry
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

    listing.analytics.inquiries = (listing.analytics.inquiries || 0) + 1;
    await listing.save({ session });

    // Notify seller
    await sendNotification(
      listing.seller.sellerId,
      'listing_inquiry',
      `A new inquiry was made on your listing "${listing.productInfo.name}" by ${req.user.personalInfo.fullname}.`,
      userId,
      session
    );

    await session.commitTransaction();
    logger.info(`Inquiry recorded for listing ${productId} by user ${userId}`);
    res.status(200).json({ success: true, message: 'Inquiry recorded successfully' });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error recording inquiry: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to record inquiry' });
  } finally {
    session.endSession();
  }
};

// Add to Cart (Analytics Tracking)
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
    logger.error(`Error adding to cart: ${error.message}`, { stack: error.stack  });
    res.status(500).json({ success: false, message: 'Failed to add to cart' });
  } finally {
    session.endSession();
  }
};


// Remove from Wishlist
export const removeFromWishlist = async (req, res) => {
  const { productId } = req.params;
  const { userId, guestId } = req.body;
  try {

    const listing = await listingModel.findOne({ 'productInfo.productId': productId });
    if (!listing || listing.verified !== 'Verified' || listing.isSold) {
      logger.warn(`Remove from wishlist failed: Listing ${productId} not found, not verified, or sold`);
      return res.status(404).json({ success: false, message: 'Listing not found, not verified, or sold' });
    }

    if (userId) {
      if (!listing.analytics.wishlist.userIds.includes(userId)) {
        logger.warn(`Remove from wishlist failed: Listing ${productId} not in wishlist for user ${userId}`);
        return res.status(400).json({ success: false, message: 'Not in wishlist' });
      }

      listing.analytics.wishlist.userIds.pull(userId);
      listing.analytics.wishlist.total = Math.max(0, (listing.analytics.wishlist.total || 0) - 1);
      await listing.save();

      await userModel.findByIdAndUpdate(userId, { $pull: { wishlist: listing._id } });
      await userModel.findByIdAndUpdate(listing.seller.sellerId, { $inc: { 'analytics.wishlistCount': -1 } });

      logger.info(`Listing ${productId} removed from wishlist by user ${userId}`);
      return res.status(200).json({ success: true, message: 'Removed from wishlist successfully' });
    }

    if (guestId) {
      if (!listing.analytics.wishlist.guestIds.includes(guestId)) {
        logger.warn(`Remove from wishlist failed: Listing ${productId} not in wishlist for guest ${guestId}`);
        return res.status(400).json({ success: false, message: 'Not in wishlist (guest)' });
      }

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
    logger.error(`Error removing from wishlist: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to remove from wishlist' });
  }
};

// Add to Wishlist
export const addToWishlist = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const { productId } = req.params;
  const { userId, guestId } = req.body;
  try {

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing || listing.verified !== 'Verified' || listing.isSold) {
      logger.warn(`Add to wishlist failed: Listing ${productId} not found, not verified, or sold`);
      return res.status(404).json({ success: false, message: 'Listing not found, not verified, or sold' });
    }

    if (userId) {
      if (!userId) {
        logger.warn(`Add to wishlist failed: User  attempted to add as ${userId}`);
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }
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
    logger.error(`Error adding to wishlist: ${error.message}`, { stack: error.stack  });
    res.status(500).json({ success: false, message: 'Failed to add to wishlist' });
  } finally {
    session.endSession();
  }
};

// Update Inventory
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
      await sendNotification(
        userId,
        'listing_low_stock',
        `Your listing "${listing.productInfo.name}" is out of stock.`,
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
      await sendNotification(
        userId,
        'listing_low_stock',
        `Your listing "${listing.productInfo.name}" is running low on stock (${inventory} left).`,
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
    logger.error(`Error updating inventory: ${error.message}`, { stack: error.stack});
    res.status(500).json({ success: false, message: 'Failed to update inventory' });
  } finally {
    session.endSession();
  }
};

// Mark Listing as Unsold
export const markAsUnSold = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Mark as unsold failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const { productId } = req.params;
    const userId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing) {
      logger.warn(`Mark as unsold failed: Listing ${productId} not found`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    const user = await userModel.findById(userId).session(session);
    if (listing.seller.sellerId.toString() !== userId ) {
      if(!user.personalInfo.isAdmin) {
        logger.warn(`Mark as unsold failed: User ${userId} not authorized`, { productId });
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }
    }
    if (!listing.isSold) {
      logger.warn(`Mark as unsold failed: Listing ${productId} already unsold`);
      return res.status(400).json({ success: false, message: 'Listing already unsold' });
    }

    listing.isSold = false;
    if(listing.inventory === 0) {
      listing.inventory += 2 
    }
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
        $pull: { 'analytics.totalSales.history': { listingId: listing._id } },
      },
      { session }
    );

    await sendNotification(
      userId,
      'listing_unsold',
      `Your listing "${listing.productInfo.name}" has been marked as unsold.`,
      null,
      session
    );

    await session.commitTransaction();
    logger.info(`Listing ${productId} marked as unsold by user ${userId}`);
    res.status(200).json({ success: true, message: 'Listing marked as unsold', data: listing });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error marking listing as unsold: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to mark listing as unsold' });
  } finally {
    session.end同一个Session();
  }
};

// Promote Listing
export const promoteListing = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Promote listing failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const { productId } = req.params;
    const duration = 30; // Default promotion duration in days
    const userId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing) {
      logger.warn(`Promote listing failed: Listing ${productId} not found`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }
    if (listing.seller.sellerId.toString() !== userId) {
      logger.warn(`Promote listing failed: User ${userId} not authorized`, { productId });
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const promotionDays = Number(duration) || 30;
    if (promotionDays < 1) {
      logger.warn(`Promote listing failed: Invalid duration ${promotionDays}`, { productId });
      return res.status(400).json({ success: false, message: 'Duration must be a positive number' });
    }

    listing.featured = true;
    listing.promotedUntil = new Date(Date.now() + promotionDays * 24 * 60 * 60 * 1000);
    await listing.save({ session });

    await sendNotification(
      userId,
      'listing_promoted',
      `Your listing "${listing.productInfo.name}" has been promoted for ${promotionDays} days.`,
      null,
      session
    );

    await session.commitTransaction();
    logger.info(`Listing ${productId} promoted by user ${userId} for ${promotionDays} days`);
    res.status(200).json({ success: true, message: 'Listing promoted successfully', data: listing });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error promoting listing: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to promote listing' });
  } finally {
    session.endSession();
  }
};

// Record Negotiation
export const recordNegotiation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Record negotiation failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const { productId } = req.params;
    const userId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing || listing.verified !== 'Verified' || listing.isSold) {
      logger.warn(`Record negotiation failed: Listing ${productId} not found, not verified, or sold`);
      return res.status(404).json({ success: false, message: 'Listing not found, not verified, or sold' });
    }
    if (!listing.negotiable) {
      logger.warn(`Record negotiation failed: Listing ${productId} is not negotiable`);
      return res.status(400).json({ success: false, message: 'This listing is not negotiable' });
    }

    listing.analytics.negotiationAttempts = (listing.analytics.negotiationAttempts || 0) + 1;
    await listing.save({ session });

    await sendNotification(
      listing.seller.sellerId,
      'listing_negotiation',
      `A negotiation attempt was made on your listing "${listing.productInfo.name}" by ${req.user.personalInfo.fullname}.`,
      userId,
      session
    );

    await session.commitTransaction();
    logger.info(`Negotiation attempt recorded for listing ${productId} by user ${userId}`);
    res.status(200).json({ success: true, message: 'Negotiation attempt recorded' });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error recording negotiation: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to record negotiation' });
  } finally {
    session.endSession();
  }
};

// Transfer Guest Data
export const transferGuestData = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Transfer guest data failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const { userId, guestId, cart, favorites } = req.body;
    if (req.user._id.toString() !== userId) {
      logger.warn(`Transfer guest data failed: User ${req.user._id} attempted to transfer as ${userId}`);
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    if (!guestId || (!cart?.length && !favorites?.length)) {
      logger.warn('Transfer guest data failed: Guest ID and cart or favorites required', { userId });
      return res.status(400).json({ success: false, message: 'Guest ID and cart or favorites required' });
    }

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

    await sendNotification(
      userId,
      'guest_data_transferred',
      `Your guest cart and wishlist data have been transferred to your account.`,
      null,
      session
    );

    await session.commitTransaction();
    logger.info(`Guest data transferred for user ${userId} from guest ${guestId}`);
    res.status(200).json({ success: true, message: 'Guest data transferred successfully' });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error transferring guest data: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to transfer guest data' });
  } finally {
    session.endSession();
  }
};

// Get Listings
export const getListings = async (req, res) => {
  try {
    // { verified: 'Verified',  isActive: true }
    const listings = await listingModel
      .find()
      .select('-aiFindings -promoteUntil -inventory -shipingOptions -expiresAt -AgreedToTerms -updatedAt -__v')
      .populate('seller.sellerId', 'personalInfo.fullname personalInfo.phone')
      .lean();
    
    logger.info(`Fetched ${listings.length} verified and active listings`);
    res.status(200).json({ success: true, data: listings });
  } catch (error) {
    logger.error(`Error fetching listings: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to fetch listings' });
  }
};

// Get Listing by ID
// Get Listing by ID
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
    if (!listing.isActive) {
      logger.info(`Listing ${productId} fetched but is inactive`);
      return res.status(200).json({
        success: true,
        message: 'Listing is inactive and requires renewal',
        data: listing,
      });
    }
    logger.info(`Listing fetched for product ${productId}`);
    res.status(200).json({ success: true, data: listing });
  } catch (error) {
    logger.error(`Error fetching listing: ${error.message}`, { stack: error.stack, productId });
    res.status(500).json({ success: false, message: 'Failed to fetch listing' });
  }
};

// Update Listing
export const updateListing = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Update listing failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { productId } = req.params;
    const { productInfo, negotiable, location, inventory, shippingOptions, sellerNotes } = req.body;
    const userId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing) {
      logger.warn(`Update listing failed: Listing ${productId} not found`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    const user = await userModel.findById(userId).session(session);
    if (listing.seller.sellerId.toString() !== userId) {
      if(!user.personalInfo.isAdmin) {
        logger.warn(`Update listing failed: User ${userId} not authorized`, { productId }); 
        return res.status(403).json({ success: false, message: 'Unauthorized to update listing' });
      }
    }

    const updateData = {};
    if (productInfo) {
      updateData.productInfo = {
        ...listing.productInfo.toObject(),
        name: sanitizeHtml(productInfo.name?.trim() || listing.productInfo.name),
        description: sanitizeHtml(productInfo.description?.trim() || listing.productInfo.description),
        price: Number(productInfo.price) || listing.productInfo.price,
        productId: listing.productInfo.productId,
        images: productInfo.images || listing.productInfo.images,
        category: productInfo.category || listing.productInfo.category,
        subCategory: productInfo.subCategory || listing.productInfo.subCategory,
        tags: productInfo.tags || listing.productInfo.tags,
        sizes: productInfo.sizes || listing.productInfo.sizes,
        colors: productInfo.colors || listing.productInfo.colors,
        usageDuration: productInfo.usageDuration || listing.productInfo.usageDuration,
        condition: productInfo.condition || listing.productInfo.condition,
        brand: productInfo.brand || listing.productInfo.brand,
        model: productInfo.model || listing.productInfo.model,
        warranty: productInfo.warranty || listing.productInfo.warranty,
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

    await session.commitTransaction();
    logger.info(`Listing updated: ${productId} by user ${userId}`);
    res.status(200).json({
      success: true,
      message: 'Listing updated successfully',
      data: updatedListing,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error updating listing: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to update listing' });
  } finally {
    session.endSession();
  }
};

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Utility function to extract public ID from Cloudinary URL
const extractPublicIdFromUrl = (url) => {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    
    // Find the index of 'upload' in the path
    const uploadIndex = pathParts.indexOf('upload');
    if (uploadIndex === -1) return null;
    
    // Get the part after the version (if exists) and before the file extension
    const publicIdWithVersion = pathParts.slice(uploadIndex + 1).join('/');
    const publicId = publicIdWithVersion.replace(/^v\d+\//, '');
    
    // Remove file extension
    return publicId.replace(/\.[^/.]+$/, '');
  } catch (error) {
    console.error('Error extracting public ID from URL:', url, error);
    return null;
  }
};

// Delete Listing Endpoint
export const deleteListing = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.user) {
      logger.warn('Delete listing failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { productId } = req.params;
    const userId = req.user._id.toString();

    // Find the listing with session for transaction consistency
    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    
    if (!listing) {
      logger.warn(`Delete listing failed: Listing ${productId} not found`);
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    const user = await userModel.findById(userId).session(session);
    if (!user) {
      logger.warn(`Delete listing failed: User ${userId} not found`);
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check authorization - user must be the seller
    if (listing.seller.sellerId.toString() !== userId) { 
      if(!user.personalInfo.isAdmin) {
        logger.warn(`Delete listing failed: User ${userId} not authorized`, { productId });
        await session.abortTransaction();
        return res.status(403).json({ success: false, message: 'Unauthorized to delete this listing' });
      }
    }

    // Delete images from Cloudinary
    if (listing.productInfo.images && listing.productInfo.images.length > 0) {
      try {
        const publicIds = listing.productInfo.images
          .map(extractPublicIdFromUrl)
          .filter(id => id !== null);

        if (publicIds.length > 0) {
          // Delete images in batches if there are many
          const batchSize = 10;
          for (let i = 0; i < publicIds.length; i += batchSize) {
            const batch = publicIds.slice(i, i + batchSize);
            await cloudinary.api.delete_resources(batch);
          }
          logger.info(`Deleted ${publicIds.length} images from Cloudinary for listing ${productId}`);
        }
      } catch (cloudinaryError) {
        logger.error(`Error deleting images from Cloudinary: ${cloudinaryError.message}`, {
          productId,
          userId
        });
        // Continue with database cleanup even if Cloudinary deletion fails
      }
    }

    // Update user model - remove listing reference and update stats
    await userModel.findByIdAndUpdate(
      listing.seller.sellerId, 
      {
        $pull: { listings: listing._id },
        $inc: { 
          'stats.activeListingsCount': listing.isSold || !listing.isActive ? 0 : -1,
          'stats.soldListingsCount': listing.isSold ? -1 : 0
        },
      },
      { session }
    );

    // Remove listing from all users' wishlists
    await userModel.updateMany(
      { wishlist: listing._id },
      { $pull: { wishlist: listing._id } },
      { session }
    );

    // Remove listing from all users' carts
    await userModel.updateMany(
      { 'cart.items.listingId': listing._id },
      { $pull: { 'cart.items': { listingId: listing._id } } },
      { session }
    );

    // Update any orders that contain this listing's product
    await orderModel.updateMany(
      { 'items.productId': productId },
      { 
        $set: { 
          'items.$[elem].cancelled': true,
          'items.$[elem].status': 'cancelled'
        }
      },
      {
        arrayFilters: [{ 'elem.productId': productId }],
        session
      }
    );


    // Delete the listing itself
    await listingModel.deleteOne({ 'productInfo.productId': productId }).session(session);

    // Commit the transaction
    await session.commitTransaction();
    
    logger.info(`Listing deleted successfully: ${productId} by user ${userId}`, {
      deletedImages: listing.productInfo.images.length,
      listingId: listing._id
    });

    res.status(200).json({ 
      success: true, 
      message: 'Listing deleted successfully',
      data: {
        productId,
        deletedImages: listing.productInfo.images.length,
      }
    });
    
  } catch (error) {
    // Abort transaction on error
    console.log('Aborting transaction due to error:', error);
    await session.abortTransaction();
    
    logger.error(`Error deleting listing: ${error.message}`, { 
      stack: error.stack, 
      userId: req.user?._id 
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete listing',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

// Alternative simplified version without transaction (if you prefer)
export const deleteListingSimple = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Delete listing failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { productId } = req.params;
    const userId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId });
    
    if (!listing) {
      logger.warn(`Delete listing failed: Listing ${productId} not found`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    if (listing.seller.sellerId.toString() !== userId) {
      logger.warn(`Delete listing failed: User ${userId} not authorized`, { productId });
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this listing' });
    }

    // Delete images from Cloudinary
    if (listing.productInfo.images && listing.productInfo.images.length > 0) {
      try {
        const publicIds = listing.productInfo.images
          .map(extractPublicIdFromUrl)
          .filter(id => id !== null);

        if (publicIds.length > 0) {
          await cloudinary.api.delete_resources(publicIds);
          logger.info(`Deleted ${publicIds.length} images from Cloudinary for listing ${productId}`);
        }
      } catch (cloudinaryError) {
        logger.error(`Error deleting images from Cloudinary: ${cloudinaryError.message}`, {
          productId,
          userId
        });
        // Continue with database cleanup
      }
    }

    // Update user model
    await userModel.findByIdAndUpdate(listing.seller.sellerId, {
      $pull: { listings: listing._id },
      $inc: { 
        'stats.activeListingsCount': listing.isSold || !listing.isActive ? 0 : -1,
        'stats.soldListingsCount': listing.isSold ? -1 : 0
      },
    });

    // Clean up related data (non-critical, can run in background)
    Promise.all([
      userModel.updateMany(
        { wishlist: listing._id },
        { $pull: { wishlist: listing._id } }
      ),
      userModel.updateMany(
        { 'cart.items.listingId': listing._id },
        { $pull: { 'cart.items': { listingId: listing._id } } }
      ),
      orderModel.updateMany(
        { 'items.productId': productId },
        { 
          $set: { 
            'items.$[elem].cancelled': true,
            'items.$[elem].status': 'cancelled'
          }
        },
        { arrayFilters: [{ 'elem.productId': productId }] }
      )
    ]).catch(cleanupError => {
      logger.error('Error during cleanup operations:', cleanupError);
    });

    // Delete the listing
    await listingModel.deleteOne({ 'productInfo.productId': productId });

    logger.info(`Listing deleted: ${productId} by user ${userId}`);
    res.status(200).json({ 
      success: true, 
      message: 'Listing deleted successfully',
      data: { productId }
    });
    
  } catch (error) {
    logger.error(`Error deleting listing: ${error.message}`, { 
      stack: error.stack, 
      productId, 
      userId: req.user?._id 
    });
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete listing' 
    });
  }
};

// Update Views
export const updateViews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { viewerId } = req.body;

    if (!viewerId) {
      logger.warn('Update views failed: Viewer ID required', { productId });
      return res.status(400).json({ success: false, message: 'Viewer ID required' });
    }

    const listing = await listingModel.findOne({ 'productInfo.productId': productId });
    if (!listing || listing.verified !== 'Verified' || listing.isSold) {
      logger.warn(`Update views failed: Listing ${productId} not found, not verified, or sold`);
      return res.status(404).json({ success: false, message: 'Listing not found, not verified, or sold' });
    }
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

// Remove from Cart
export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const { userId, guestId } = req.body;

    const listing = await listingModel.findOne({ 'productInfo.productId': productId });
    if (!listing || listing.verified !== 'Verified' || listing.isSold || listing.inventory <= 0) {
      logger.warn(`Remove from cart failed: Listing ${productId} not available`);
      return res.status(404).json({ success: false, message: 'Listing not available' });
    }

    if (req.user && userId) {
      if (req.user._id.toString() !== userId) {
        logger.warn(`Remove from cart failed: User ${req.user._id} attempted to remove as ${userId}`);
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }
      if (!listing.analytics.cartAdditions.userIds.includes(userId)) {
        logger.warn(`Remove from cart failed: Listing ${productId} not in cart for user ${userId}`);
        return res.status(400).json({ success: false, message: 'Not in cart' });
      }

      listing.analytics.cartAdditions.userIds.pull(userId);
      listing.analytics.cartAdditions.total = Math.max(0, (listing.analytics.cartAdditions.total || 0) - 1);
      await listing.save();

      await userModel.findByIdAndUpdate(listing.seller.sellerId, { $inc: { 'analytics.cartAdditions': -1 } });

      logger.info(`Listing ${productId} removed from cart by user ${userId}`);
      res.status(200).json({ success: true, message: 'Removed from cart successfully' });
    } else if (guestId) {
      if (!listing.analytics.cartAdditions.guestIds.includes(guestId)) {
        logger.warn(`Remove from cart failed: Listing ${productId} not in cart for guest ${guestId}`);
        return res.status(400).json({ success: false, message: 'Not in cart (guest)' });
      }

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

// Share Listing
export const shareListing = async (req, res) => {
  try {
    const { productId } = req.params;
    const { platform } = req.body;

    if (!platform) {
      logger.warn('Share listing failed: Platform required', { productId });
      return res.status(400).json({ success: false, message: 'Platform required' });
    }

    const listing = await listingModel.findOne({ 'productInfo.productId': productId });
    if (!listing || listing.verified !== 'Verified' || listing.isSold) {
      logger.warn(`Share listing failed: Listing ${productId} not found, not verified, or sold`);
      return res.status(404).json({ success: false, message: 'Listing not found, not verified, or sold' });
    }

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

// Feature Listing (Admin Only)
export const featureListing = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!req.user) {
      logger.warn('Feature listing failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!req.user.personalInfo?.isAdmin) {
      logger.warn(`Feature listing failed: User ${req.user._id} not admin`);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { productId } = req.params;
    const { featured } = req.body;
    const adminId = req.user._id.toString();

    const listing = await listingModel.findOne({ 'productInfo.productId': productId }).session(session);
    if (!listing) {
      logger.warn(`Feature listing failed: Listing ${productId} not found`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    listing.featured = Boolean(featured);
    listing.promotedUntil = featured ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
    await listing.save({ session });

    await sendNotification(
      listing.seller.sellerId,
      'listing_promoted',
      `Your listing "${listing.productInfo.name}" has been ${featured ? 'featured' : 'unfeatured'} by an admin.`,
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
    logger.error(`Error featuring listing: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to feature listing' });
  } finally {
    session.endSession();
  }
};

// Update Response Time (Admin Only)
export const updateResponseTime = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Update response time failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!req.user.personalInfo?.isAdmin) {
      logger.warn(`Update response time failed: User ${req.user._id} not admin`);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { productId } = req.params;
    const { responseTime } = req.body;

    if (typeof responseTime !== 'number' || responseTime < 0) {
      logger.warn(`Update response time failed: Invalid response time ${responseTime}`, { productId });
      return res.status(400).json({ success: false, message: 'Response time must be a non-negative number' });
    }

    const listing = await listingModel.findOneAndUpdate(
      { 'productInfo.productId': productId },
      { 'seller.responseTime': responseTime },
      { new: true }
    );
    if (!listing) {
      logger.warn(`Update response time failed: Listing ${productId} not found`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    const sellerListings = await listingModel.find({ 'seller.sellerId': listing.seller.sellerId });
    const totalResponseTime = sellerListings.reduce((sum, l) => sum + l.seller.responseTime, 0);
    await userModel.findByIdAndUpdate(listing.seller.sellerId, {
      'analytics.responseTimeAvg': sellerListings.length ? totalResponseTime / sellerListings.length : 0,
    });

    logger.info(`Response time updated for listing ${productId} by admin ${req.user._id}`);
    res.status(200).json({ success: true, message: 'Response time updated', data: listing });
  } catch (error) {
    logger.error(`Error updating response time: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to update response time' });
  }
};

// Update Acceptance Rate (Admin Only)
export const updateAcceptanceRate = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Update acceptance rate failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!req.user.personalInfo?.isAdmin) {
      logger.warn(`Update acceptance rate failed: User ${req.user._id} not admin`);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { productId } = req.params;
    const { acceptanceRate } = req.body;

    if (typeof acceptanceRate !== 'number' || acceptanceRate < 0 || acceptanceRate > 100) {
      logger.warn(`Update acceptance rate failed: Invalid acceptance rate ${acceptanceRate}`, { productId });
      return res.status(400).json({ success: false, message: 'Acceptance rate must be between 0 and 100' });
    }

    const listing = await listingModel.findOneAndUpdate(
      { 'productInfo.productId': productId },
      { 'seller.acceptanceRate': acceptanceRate },
      { new: true }
    );
    if (!listing) {
      logger.warn(`Update acceptance rate failed: Listing ${productId} not found`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    logger.info(`Acceptance rate updated for listing ${productId} by admin ${req.user._id}`);
    res.status(200).json({ success: true, message: 'Acceptance rate updated', data: listing });
  } catch (error) {
    logger.error(`Error updating acceptance rate: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to update acceptance rate' });
  }
};

// Update Conversion Rate (Admin Only)
export const updateConversionRate = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Update conversion rate failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!req.user.personalInfo?.isAdmin) {
      logger.warn(`Update conversion rate failed: User ${req.user._id} not admin`);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { productId } = req.params;
    const { conversionRate } = req.body;

    if (typeof conversionRate !== 'number' || conversionRate < 0 || conversionRate > 100) {
      logger.warn(`Update conversion rate failed: Invalid conversion rate ${conversionRate}`, { productId });
      return res.status(400).json({ success: false, message: 'Conversion rate must be between 0 and 100' });
    }

    const listing = await listingModel.findOneAndUpdate(
      { 'productInfo.productId': productId },
      { 'analytics.conversionRate': conversionRate },
      { new: true }
    );
    if (!listing) {
      logger.warn(`Update conversion rate failed: Listing ${productId} not found`);
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    logger.info(`Conversion rate updated for listing ${productId} by admin ${req.user._id}`);
    res.status(200).json({ success: true, message: 'Conversion rate updated', data: listing });
  } catch (error) {
    logger.error(`Error updating conversion rate: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to update conversion rate' });
  }
};

export const getSellerListings = async (req, res) => {
  try {
    console.log("Seller started fetching listings");
    const { sellerId } = req.params;
    const listings = await listingModel
      .find({ 'seller.sellerId': sellerId })
      .select('-aiFindings') // Exclude aiFindings field
      .sort({ createdAt: -1 }) // Sort by creation date, newest first
      .lean(); // Convert to plain JavaScript objects

    if (!listings.length) {
      logger.warn(`No listings found for seller ${sellerId}`);
      return res.status(404).json({ success: false, message: 'No listings found for this seller' });
    }

    logger.info(`Fetched ${listings.length} listings for seller ${sellerId}`);
    res.status(200).json({ success: true, data: listings });
  } catch (error) {
    console.log("Error fetching seller listings:", error);
    logger.error(`Error fetching seller listings: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to fetch seller listings' });
  }
};
// Get Pending Listings (Admin Only)
export const getPendingListings = async (req, res) => {
  try {
    if (!req.user) {
      logger.warn('Get pending listings failed: No user data in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const adminId = req.user._id.toString();
    const admin = await userModel.findById(adminId);
    if (!admin || !admin.personalInfo?.isAdmin) {
      logger.warn(`Get pending listings failed: User ${adminId} not admin`);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const listings = await listingModel
      .find({ verified: 'Pending' })
      .populate('seller.sellerId', 'personalInfo.fullname personalInfo.phone')
      .lean();
    logger.info(`Fetched ${listings.length} pending listings by admin ${req.user._id}`);
    res.status(200).json({ success: true, data: listings });
  } catch (error) {
    logger.error(`Errgsor fetching pending listings: ${error.message}`, { stack: error.stack, userId: req.user?._id });
    res.status(500).json({ success: false, message: 'Failed to fetch pending listings' });
  }
};

// Get Featured Listings
export const getFeaturedListings = async (req, res) => {
  try {
    const listings = await listingModel
      .find({ featured: true, verified: 'Verified', isSold: false, isActive: true })
      .populate('seller.sellerId', 'personalInfo.fullname personalInfo.phone')
      .lean();
    logger.info(`Fetched ${listings.length} featured and active listings`);
    res.status(200).json({ success: true, data: listings });
  } catch (error) {
    logger.error(`Error fetching featured listings: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to fetch featured listings' });
  }
};

// Get Listings Near
export const getListingsNear = async (req, res) => {
  try {
    const { lat, lng, maxDistance = 10000 } = req.query;
    if (!lat || !lng) {
      logger.warn('Get listings near failed: Latitude and longitude required');
      return res.status(400).json({ success: false, message: 'Latitude and longitude required' });
    }

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
        isActive: true,
      })
      .populate('seller.sellerId', 'personalInfo.fullname personalInfo.phone personalInfo.location')
      .lean();

    logger.info(`Fetched ${listings.length} active listings near [${lat}, ${lng}]`);
    res.status(200).json({ success: true, data: listings });
  } catch (error) {
    logger.error(`Error fetching nearby listings: ${error.message}`, { stack: error.stack, lat, lng });
    res.status(500).json({ success: false, message: 'Failed to fetch nearby listings' });
  }
};

// Verify Listing (Admin Only)
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

    const findingsSummary = listing.aiFindings
      ? listing.aiFindings
          .map((finding) => `- ${finding.title} (${finding.priority}): ${finding.description} [Action: ${finding.action}]`)
          .join('\n')
      : 'No AI findings available.';

    // Notify seller
    const notificationType = status === 'Verified' ? 'listing_verified' : 'listing_rejected';
    const notificationContent =
      status === 'Verified'
        ? `Your listing "${listing.productInfo.name}" has been manually verified by an admin and is now live!`
        : `Your listing "${listing.productInfo.name}" was manually rejected by an admin. AI Findings:\n${findingsSummary}`;
    await sendNotification(
      listing.seller.sellerId,
      notificationType,
      notificationContent,
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
    logger.error(`Error verifying listing: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to verify listing' });
  } finally {
    session.endSession();
  }
};

/**
 * Update All Listings
 * @route POST /api/listings/update-all
 * @desc Update all listings to set isActive to true, initialize aiFindings, and set expiresAt to 30 days from now, and notify sellers
 * @access Private (admin-only, add authentication middleware if needed)
 */
export const updateAllListings = async (req, res) => {
  try {
    // Calculate expiration date (30 days from now)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 360);

    // Update all listings
    const updateResult = await listingModel.updateMany(
      {}, // Match all documents
      {
        $set: {
          isActive: true,
          expiresAt: thirtyDaysFromNow,
          aiFindings: [] // Initialize aiFindings as empty array if not present
        }
      }
    );

    logger.info(`Updated ${updateResult.modifiedCount} listings to isActive: true, expiresAt: ${thirtyDaysFromNow}`);

    // Fetch all listings to get seller information
    const listings = await listingModel
      .find({})
      .populate('seller.sellerId', 'personalInfo.email personalInfo.fullname')
      .lean();

    // Prepare email promises
    const emailPromises = listings.map(async (listing) => {
      const seller = listing.seller?.sellerId;
      if (!seller || !seller.personalInfo?.email) {
        logger.warn(`No valid email for seller of listing ${listing._id}`);
        return;
      }

      const emailContent = `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Listing Status Update</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
                  <!-- Logo -->
                  <tr>
                    <td>
                      <img src="https://bei-fity-com.vercel.app/assets/logo-without-Dr_6ibJh.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                    </td>
                  </tr>
                  <!-- Heading -->
                  <tr>
                    <td>
                      <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Your Listing is Now Active!</h2>
                    </td>
                  </tr>
                  <!-- Greeting -->
                  <tr>
                    <td>
                      <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Hello ${seller.personalInfo.fullname || 'Seller'},</p>
                    </td>
                  </tr>
                  <!-- Message -->
                  <tr>
                    <td>
                      <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                        We’re pleased to inform you that your listing <strong>"${listing.productInfo.name}"</strong> is now active on <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>! It will remain active until <strong>${thirtyDaysFromNow.toLocaleDateString()}</strong>.
                      </p>
                      <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                        You can manage your listing or view its performance directly on our platform.
                      </p>
                    </td>
                  </tr>
                  <!-- Button -->
                  <tr>
                    <td>
                      <a href="${env.FRONTEND_URL}/listings/${listing._id}" style="display: inline-block; padding: 15px 20px; background-color: #1e40af; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 700; border-radius: 8px; margin-bottom: 30px; transition: background-color 0.3s;">View Your Listing</a>
                    </td>
                  </tr>
                  <!-- Note -->
                  <tr>
                    <td>
                      <p style="font-size: 13px; color: #64748b; margin-top: 20px;">If you have any questions, please contact our support team.</p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="margin-top: 30px;">
                      <p style="font-size: 14px; color: #64748b; margin: 0;">Best regards,</p>
                      <p style="font-weight: 700; color: #d97706; font-size: 16px; margin-top: 10px;">Bei<span style="color: #1e40af;">Fity.Com</span></p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>`;

      try {
        await sendEmail(
          seller.personalInfo.email,
          'Your Listing is Now Active on BeiFity.Com',
          emailContent
        );
        logger.info(`Email sent to ${seller.personalInfo.email} for listing ${listing._id}`);
      } catch (emailError) {
        logger.error(`Failed to send email to ${seller.personalInfo.email} for listing ${listing._id}: ${emailError.message}`);
      }
    });

    // Send all emails concurrently
    await Promise.all(emailPromises);

    return res.status(200).json({
      success: true,
      message: `Successfully updated ${updateResult.modifiedCount} listings and notified sellers`,
    });
  } catch (error) {
    logger.error(`Error updating listings: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Failed to update listings' });
  }
};

export const checkInventory = async (req, res) => {
  try {
    const { items } = req.body; // Expecting an array of { productId, quantity }
    if (!Array.isArray(items) || items.length === 0) {
      logger.warn('Check inventory failed: Items array required');
      return res.status(400).json({ success: false, message: 'Items array required' });
    }
    const productIds = items.map(item => item.productId);
    const listings = await listingModel.find({ 'productInfo.productId': { $in: productIds } }).lean();
    const inventoryStatus = items.map(item => {
      const listing = listings.find(l => l.productInfo.productId === item.productId);
      if (!listing) {
        return { productId: item.productId, available: false, message: 'Listing not found' };
      }
      if (listing.isSold || listing.inventory <= 0) {
        return { productId: item.productId, available: false, message: 'Out of stock' };
      }
      if (item.quantity > listing.inventory) {
        return { productId: item.productId, available: false, message: `Only ${listing.inventory} left in stock` };
      }
      return { productId: item.productId, available: true, message: 'In stock' };
    });
    res.status(200).json({ success: true, data: inventoryStatus });
  } catch (error) { 
    logger.error(`Error checking inventory: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to check inventory' });
  }
}