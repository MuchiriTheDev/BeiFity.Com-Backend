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
} from '../controllers/listingController.js';
import { authUser } from '../middlewares/authMiddleware.js';
import { cache } from '../app.js';
; // Import cache from app.js

const listingRouter = express.Router();

// Caching middleware for public routes
const cacheMiddleware = (ttl = 3600) => (req, res, next) => {
  const cacheKey = `${req.method}_${req.originalUrl}`;
  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    console.log(`Cache hit for ${cacheKey}`);
    return res.set('Cache-Control', `public, max-age=${ttl}`).json(cachedData);
  }

  const originalJson = res.json;
  res.json = (data) => {
    cache.set(cacheKey, data, ttl);
    originalJson.call(res, data);
  };
  next();
};

// Public Routes (with caching)
listingRouter.get('/', cacheMiddleware(3600), getListings); // Cache for 1 hour
listingRouter.get('/byproductId/:productId', cacheMiddleware(3600), getListingById); // Cache for 1 hour
listingRouter.post('/:productId/views', cacheMiddleware(300), updateViews); // Cache for 5 minutes
listingRouter.post('/:productId/share', shareListing); // No caching (dynamic)
listingRouter.get('/sellerslistings/:sellerId', cacheMiddleware(3600), getSellerListings); // Cache for 1 hour
listingRouter.get('/featured', cacheMiddleware(86400), getFeaturedListings); // Cache for 1 day
listingRouter.get('/near', cacheMiddleware(3600), getListingsNear); // Cache for 1 hour
listingRouter.post('/transfer-guest-data', authUser, transferGuestData);
listingRouter.post('/:productId/wishlist/add', authUser, addToWishlist); // No caching (user-specific)
listingRouter.post('/:productId/wishlist/remove', authUser, removeFromWishlist); // No caching
listingRouter.post('/:productId/cart/add', authUser, addToCart); // No caching
listingRouter.post('/:productId/cart/remove', authUser, removeFromCart); // No caching
listingRouter.put('/:productId/renew', authUser, renewListing); // No caching

// Private Routes (authenticated users, selective caching)
listingRouter.post('/add', authUser, async (req, res) => {
  const result = await addListing(req, res);
  if (result) {
    // Invalidate related caches
    cache.del('GET_/api/listings');
    cache.del(`GET_/api/listings/sellerslistings/${req.body.sellerId}`);
    cache.del('GET_/api/listings/featured');
    cache.del('GET_/api/listings/near');
  }
  return result;
});

listingRouter.put('/update-product/:productId', authUser, async (req, res) => {
  const result = await updateListing(req, res);
  if (result) {
    // Invalidate caches
    cache.del('GET_/api/listings');
    cache.del(`GET_/api/listings/byproductId/${req.params.productId}`);
    cache.del(`GET_/api/listings/sellerslistings/${result.sellerId}`);
    cache.del('GET_/api/listings/featured');
    cache.del('GET_/api/listings/near');
  }
  return result;
});

listingRouter.delete('/delete-product/:productId', authUser, async (req, res) => {
  const result = await deleteListing(req, res);
  if (result) {
    cache.del('GET_/api/listings');
    cache.del(`GET_/api/listings/byproductId/${req.params.productId}`);
    cache.del(`GET_/api/listings/sellerslistings/${result.sellerId}`);
    cache.del('GET_/api/listings/featured');
    cache.del('GET_/api/listings/near');
  }
  return result;
});

listingRouter.post('/:productId/reviews', authUser, async (req, res) => {
  const result = await addReview(req, res);
  if (result) {
    cache.del(`GET_/api/listings/byproductId/${req.params.productId}`);
  }
  return result;
});

listingRouter.put('/product/:productId/sold', authUser, async (req, res) => {
  const result = await markAsSold(req, res);
  if (result) {
    cache.del('GET_/api/listings');
    cache.del(`GET_/api/listings/byproductId/${req.params.productId}`);
    cache.del(`GET_/api/listings/sellerslistings/${result.sellerId}`);
    cache.del('GET_/api/listings/featured');
    cache.del('GET_/api/listings/near');
  }
  return result;
});

listingRouter.put('/product/:productId/unsold', authUser, async (req, res) => {
  const result = await markAsUnSold(req, res);
  if (result) {
    cache.del('GET_/api/listings');
    cache.del(`GET_/api/listings/byproductId/${req.params.productId}`);
    cache.del(`GET_/api/listings/sellerslistings/${result.sellerId}`);
    cache.del('GET_/api/listings/featured');
    cache.del('GET_/api/listings/near');
  }
  return result;
});

listingRouter.put('/:productId/promote', authUser, async (req, res) => {
  const result = await promoteListing(req, res);
  if (result) {
    cache.del('GET_/api/listings');
    cache.del(`GET_/api/listings/byproductId/${req.params.productId}`);
    cache.del('GET_/api/listings/featured');
  }
  return result;
});

listingRouter.put('/:productId/inventory', authUser, async (req, res) => {
  const result = await updateInventory(req, res);
  if (result) {
    cache.del('GET_/api/listings');
    cache.del(`GET_/api/listings/byproductId/${req.params.productId}`);
    cache.del(`GET_/api/listings/sellerslistings/${result.sellerId}`);
  }
  return result;
});

listingRouter.patch('/:productId/renew', authUser, async (req, res) => {
  const result = await renewListing(req, res);
  if (result) {
    cache.del('GET_/api/listings');
    cache.del(`GET_/api/listings/byproductId/${req.params.productId}`);
    cache.del(`GET_/api/listings/sellerslistings/${result.sellerId}`);
    cache.del('GET_/api/listings/featured');
  }
  return result;
});

// Admin Routes (no caching)
listingRouter.get('/admin/pending', authUser, getPendingListings);
listingRouter.put('/admin/:productId/response-time', authUser, updateResponseTime);
listingRouter.put('/admin/:productId/acceptance-rate', authUser, updateAcceptanceRate);
listingRouter.put('/admin/:productId/conversion-rate', authUser, updateConversionRate);
listingRouter.put('/admin/:productId/feature', authUser, async (req, res) => {
  const result = await featureListing(req, res);
  if (result) {
    cache.del('GET_/api/listings/featured');
    cache.del('GET_/api/listings');
    cache.del(`GET_/api/listings/byproductId/${req.params.productId}`);
  }
  return result;
});
listingRouter.post('/admin/update-all', authUser, async (req, res) => {
  const result = await updateAllListings(req, res);
  if (result) {
    cache.flushAll(); // Clear all caches due to bulk update
  }
  return result;
});

export default listingRouter;