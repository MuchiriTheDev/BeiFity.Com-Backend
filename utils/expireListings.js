// jobs/expireListings.js
import mongoose from 'mongoose';
import cron from 'node-cron';
import { listingModel } from '../models/Listing.js';
import { userModel } from '../models/User.js';
import { sendListingNotification } from '../controllers/listingController.js';
import logger from './logger.js';

// Run every day at midnight
cron.schedule('0 0 * * *', async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const now = new Date();
    const expiredListings = await listingModel
      .find({ expiresAt: { $lte: now }, isActive: true })
      .session(session);

    for (const listing of expiredListings) {
      listing.isActive = false;
      await listing.save({ session });

      await userModel.findByIdAndUpdate(
        listing.seller.sellerId,
        { $inc: { 'stats.activeListingsCount': -1 } },
        { session }
      );

      await sendListingNotification(
        listing.seller.sellerId.toString(),
        'listing_expired',
        `Your listing "${listing.productInfo.name}" has expired. Renew it to make it active again.`,
        listing.productInfo.productId,
        null,
        session
      );

      logger.info(`Listing ${listing.productInfo.productId} marked as inactive due to expiration`);
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error in expireListings job: ${error.message}`, { stack: error.stack });
  } finally {
    session.endSession();
  }
});