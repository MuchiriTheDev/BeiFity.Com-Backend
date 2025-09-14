import express from 'express';
import {
  getListings,
  getListingById,
  addListing,
  updateListing,
  deleteListing,
  updateViews,
  addReview,
  addToWishlist,
  removeFromWishlist,
  addToCart,
  shareListing,
  markAsSold,
  promoteListing,
  updateResponseTime,
  updateAcceptanceRate,
  updateConversionRate,
  updateInventory,
  getSellerListings,
  getPendingListings,
  featureListing,
  getFeaturedListings,
  getListingsNear,
  transferGuestData,
  removeFromCart,
  markAsUnSold,
  updateAllListings,
  renewListing,
  checkInventory,
} from '../controllers/listingController.js';
import { authUser } from '../middlewares/authMiddleware.js';

const listingRouter = express.Router();

// Public Routes
listingRouter.get('/', getListings);
listingRouter.get('/byproductId/:productId', getListingById);
listingRouter.post('/:productId/views', updateViews);
listingRouter.post('/:productId/share', shareListing);
listingRouter.get('/sellerslistings/:sellerId', getSellerListings);
listingRouter.get('/featured', getFeaturedListings);
listingRouter.get('/near', getListingsNear);
listingRouter.post('/transfer-guest-data', authUser, transferGuestData);
listingRouter.post('/:productId/wishlist/add', authUser, addToWishlist);
listingRouter.post('/:productId/wishlist/remove', authUser, removeFromWishlist);
listingRouter.post('/:productId/cart/add', authUser, addToCart);
listingRouter.post('/:productId/cart/remove', authUser, removeFromCart);
listingRouter.put('/:productId/renew', authUser, renewListing);
listingRouter.post('/check-inventory', authUser, checkInventory);

// Private Routes (authenticated users)
listingRouter.post('/add', authUser, addListing);
listingRouter.put('/update-product/:productId', authUser, updateListing);
listingRouter.delete('/delete-product/:productId', authUser, deleteListing);
listingRouter.post('/:productId/reviews', authUser, addReview);
listingRouter.put('/product/:productId/sold', authUser, markAsSold);
listingRouter.put('/product/:productId/unsold', authUser, markAsUnSold);
listingRouter.put('/:productId/promote', authUser, promoteListing);
listingRouter.put('/:productId/inventory', authUser, updateInventory);
listingRouter.patch('/:productId/renew', authUser, renewListing);

// Admin Routes
listingRouter.get('/admin/pending', authUser, getPendingListings);
listingRouter.put('/admin/:productId/response-time', authUser, updateResponseTime);
listingRouter.put('/admin/:productId/acceptance-rate', authUser, updateAcceptanceRate);
listingRouter.put('/admin/:productId/conversion-rate', authUser, updateConversionRate);
listingRouter.put('/admin/:productId/feature', authUser, featureListing);
listingRouter.post('/admin/update-all', authUser, updateAllListings);

export default listingRouter;