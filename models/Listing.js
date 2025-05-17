import mongoose from 'mongoose';

// Product Information Schema
const ProductInfoSchema = new mongoose.Schema({
  productId: {
    type: String,
    unique: true,
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  details: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  cancelledPrice: {
    type: Number,
  },
  images: {
    type: [String],
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  subCategory: {
    type: String,
    default: '',
  },
  tags: {
    type: [String],
    default: [],
  },
  sizes: {
    type: [String],
    default: [],
  },
  colors: {
    type: [String],
    default: [],
  },
  usageDuration: {
    type: String,
    default: 'Brand New (0-1 months)',
  },
  condition: {
    type: String,
    enum: ['New', 'Like New', 'Used', 'Refurbished'],
    default: 'New',
  },
  brand: {
    type: String,
    default: '',
  },
  model: {
    type: String,
    default: '',
  },
  warranty: {
    type: String,
    default: 'No Warranty',
  },
});

// Seller Information Schema
const SellerInfoSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  sellerNotes: {
    type: String,
    default: '',
  },
  responseTime: {
    type: Number,
    default: 0,
  },
  acceptanceRate: {
    type: Number,
    default: 0,
  },
});

// Analytics Schema
const AnalyticsSchema = new mongoose.Schema({
  views: {
    total: {
      type: Number,
      default: 0,
    },
    uniqueViewers: {
      type: [String],
      default: [],
    },
  },
  cartAdditions: {
    total: { type: Number, default: 0 },
    userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
    guestIds: [{ type: String, default: [] }], // Track guest actions
  },
  wishlist: {
    total: { type: Number, default: 0 },
    userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
    guestIds: [{ type: String, default: [] }], // Track guest actions
  },
  shared: {
    total: {
      type: Number,
      default: 0,
    },
    platforms: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  inquiries: {
    type: Number,
    default: 0,
  },
  negotiationAttempts: {
    type: Number,
    default: 0,
  },
  ordersNumber: {
    type: Number,
    default: 0,
  },
  conversionRate: {
    type: Number,
    default: 0,
  },
});

// Review Schema
const ReviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Main Listing Schema
const ListingSchema = new mongoose.Schema({
  productInfo: {
    type: ProductInfoSchema,
    required: true,
  },
  seller: {
    type: SellerInfoSchema,
    required: true,
  },
  analytics: {
    type: AnalyticsSchema,
    default: () => ({}),
  },
  reviews: {
    type: [ReviewSchema],
    default: [],
  },
  negotiable: {
    type: Boolean,
    default: false,
  },
  verified: {
    type: String,
    default: 'Pending',
    enum: ['Pending', 'Verified', 'Rejected'],
  },
  location: {
    type: String,
    default: 'Kenya',
  },
  isSold: {
    type: Boolean,
    default: false,
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  AgreedToTerms: {
    type: Boolean,
    required: true,
  },
  featured: {
    type: Boolean,
    default: false,
  },
  promotedUntil: {
    type: Date,
  },
  inventory: {
    type: Number,
    default: 1,
  },
  shippingOptions: {
    type: [String],
    default: ['Local Pickup', 'Delivery'],
  },
}, { timestamps: true });

// Pre-save hook to calculate rating
ListingSchema.pre('save', function (next) {
  if (this.isModified('reviews')) {
    const reviews = this.reviews || [];
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    this.rating = reviews.length ? totalRating / reviews.length : 0;
  }
  next();
});

export const listingModel = mongoose.model('Listing', ListingSchema);