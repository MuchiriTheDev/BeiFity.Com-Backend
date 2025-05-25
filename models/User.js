import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    // Personal Information (core profile data for trust, marketing, and communication)
    personalInfo: {
      username: {
        type: String,
        unique: true,
        sparse: true, // Allows nulls but enforces uniqueness
        trim: true,
        minlength: 3,
        maxlength: 30,
      },
      fullname: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },
      email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        index: true,
      },
      verified: {
        type: Boolean,
        default: false,
      },
      password: {
        type: String,
        required: true,
        select: false,
      },
      profilePicture: {
        type: String,
        default: 'https://cdn.vectorstock.com/i/500p/45/59/profile-photo-placeholder-icon-design-in-gray-vector-37114559.jpg',
      },
      phone: {
        type: String,
        required: true, // Essential for buyer-seller communication
        validate: {
          validator: (v) => /^\+?[0-9]{7,15}$/.test(v),
          message: 'Invalid phone number',
        },
        index: true, // Faster lookups for communication
      },
      location: {
        country: { type: String, default: 'Kenya' },
        city: { type: String, default: '' }, // More granular location data
        coordinates: {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: { type: [Number], default: [36.8219, -1.2921] }, // [longitude, latitude], Nairobi default
        },
      },
      bio: {
        type: String,
        default: '',
        trim: true,
      },
      socialLinks: {
        facebook: { type: String, default: '' },
        twitter: { type: String, default: '' },
        instagram: { type: String, default: '' },
        website: { type: String, default: '' }, // Additional marketing link
      },
      profileCompleteness: {
        type: Number,
        default: 0, // 0-100, calculated based on filled fields
      },
      isAdmin: {
        type: Boolean,
        default: false, // For platform administration
      },
      deviceToken: { type: String },
    },
    pushSubscription: { type: Object },
    lastSeen: { type: Date, default: Date.now }, // Last active time
    // Analytics (detailed metrics for engagement and performance insights)
      // Analytics (updated with report counters)
    analytics: {
      totalSales: {
        amount: { type: Number, default: 0 },
        history: [
          {
            amount: { type: Number, required: true },
            listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
            date: { type: Date, default: Date.now },
          },
        ],
      },
      salesCount: { type: Number, default: 0 },
      orderCount: { type: Number, default: 0 },
      profileViews: {
        total: { type: Number, default: 0 },
        uniqueViewers: { type: [String], default: [] },
        history: [
          {
            viewerId: { type: String },
            date: { type: Date, default: Date.now },
          },
        ],
      },
      lastActive: { type: Date, default: Date.now },
      listingViews: { type: Number, default: 0 },
      wishlistCount: { type: Number, default: 0 },
      cartAdditions: { type: Number, default: 0 },
      shares: {
        total: { type: Number, default: 0 },
        platforms: { type: Map, of: Number, default: () => new Map() },
      },
      responseTimeAvg: { type: Number, default: 0 },
      // New fields for reporting
      reportsSubmitted: { type: Number, default: 0 }, // Number of reports filed by this user
      reportsReceived: { type: Number, default: 0 }, // Number of reports filed against this user
    },

    // Rating (user reputation summary)
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      reviewCount: { type: Number, default: 0 },
    },

    // Relationships (listings, orders, and wishlist)
    listings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }],
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Orders' }],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }], // User’s wishlist

    // Stats (quick metrics for activity)
    stats: {
      activeListingsCount: { type: Number, default: 0 },
      soldListingsCount: { type: Number, default: 0 },
      pendingOrdersCount: { type: Number, default: 0 },
      completedOrdersCount: { type: Number, default: 0 },
      failedOrdersCount: { type: Number, default: 0 }, // Orders cancelled or failed
      listingFeesPaid: { type: Number, default: 0 }, // Total fees paid for listings
    },

    // Marketing and Platform Features
    isFeatured: { type: Boolean, default: false },
    badges: {
      type: [String],
      enum: ['Top Seller', 'Verified', 'Fast Responder', 'New User', 'Trusted Buyer',"Referrer"],
      default: [],
    },
    preferences: {
      emailNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: false },
      marketingEmails: { type: Boolean, default: true }, // Opt-in for promotions
    },
    referralCode: {
      type: String,
      unique: true,
      default: () => `REF${Math.random().toString(36).substr(2, 8).toUpperCase()}`, // Unique referral code
    },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User who referred them

    // Reviews (embedded for reputation)
    reviews: [
      {
        reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        comment: { type: String, trim: true, maxlength: 500 },
        rating: { type: Number, min: 0, max: 5, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // Financial Tracking (for revenue and payouts)
    financials: {
      balance: { type: Number, default: 0 }, // Earnings from sales minus fees
      payoutHistory: [
        {
          amount: { type: Number, required: true },
          date: { type: Date, default: Date.now },
          method: { type: String, enum: ['Bank', 'Mobile', 'PayPal'], required: true },
        },
      ],
    },
  },
  { timestamps: true }
);

// Pre-save hooks (unchanged, but ensuring analytics updates are safe)
UserSchema.pre('save', function (next) {
  // Update rating based on reviews
  if (this.isModified('reviews')) {
    const reviews = this.reviews || [];
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    this.rating.average = reviews.length ? totalRating / reviews.length : 0;
    this.rating.reviewCount = reviews.length;
  }

  // Calculate profile completeness
  const fields = [
    this.personalInfo.username,
    this.personalInfo.fullname,
    this.personalInfo.email,
    this.personalInfo.phone,
    this.personalInfo.profilePicture !== UserSchema.paths['personalInfo.profilePicture'].defaultValue,
    this.personalInfo.bio,
    this.personalInfo.socialLinks.facebook || this.personalInfo.socialLinks.twitter || this.personalInfo.socialLinks.instagram,
  ];
  this.personalInfo.profileCompleteness = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  next();
});

// Indexes (updated with report-related analytics)
UserSchema.index({ 'personalInfo.email': 1 });
UserSchema.index({ 'personalInfo.username': 1 }, { sparse: true });
UserSchema.index({ 'personalInfo.phone': 1 });
UserSchema.index({ 'personalInfo.location.coordinates': '2dsphere' });
UserSchema.index({ 'analytics.lastActive': 1 });
UserSchema.index({ 'stats.listingFeesPaid': 1 });
UserSchema.index({ 'analytics.reportsReceived': 1 }); // New index for reports received
UserSchema.index({ 'analytics.reportsSubmitted': 1 }); // New index for reports submitted

export const userModel = mongoose.model('User', UserSchema);