import express from 'express';
import {
  updateProfileViews,
  getUserProfile,
  getAuthenticatedProfile,
  updateUserProfile,
  getSeller,
  getUsers,
  getSpecificPeople,
  addToWishlist,
  removeFromWishlist,
  getReferralLink,
  addSellerReview,
  getOnlySellers,
  removeSellerReview,
} from '../controllers/userController.js';
import { authUser } from '../middlewares/authMiddleware.js';

const userRouter = express.Router();

// Public Routes
userRouter.get('/:userId', getUserProfile); // Fetch a user’s public profile
userRouter.get('/seller/:sellerId', getSeller); // Fetch a seller’s public profile
userRouter.get('/all/users', getUsers); // Fetch all users (for chat or listing purposes)
userRouter.get("/sitemap/sellers", getOnlySellers)
userRouter.post('/people', getSpecificPeople); // Fetch specific users by IDs
userRouter.post('/update-views/:sellerId', updateProfileViews); // Update profile views

// Private Routes (require authentication)
userRouter.get('/auth/profile', authUser, getAuthenticatedProfile); // Fetch authenticated user’s full profile
userRouter.post('/seller-review/:sellerId', authUser ,addSellerReview)
userRouter.put('/update/profile', authUser, updateUserProfile); // Update authenticated user’s profile
userRouter.post('/wishlist/:listingId', authUser, addToWishlist); // Add to wishlist
userRouter.delete('/wishlist/:listingId', authUser, removeFromWishlist); // Remove from wishlist
userRouter.post('/link/referral', authUser, getReferralLink); // Get referral link
userRouter.post('/seller-review/:sellerId/:reviewId', authUser, removeSellerReview); // Remove seller review

export default userRouter;