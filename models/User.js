import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    // Existing personalInfo structure (unchanged)
    personalInfo: {
      username: {
        type: String,
        unique: true,
        sparse: true,
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
        default: 'https://img.freepik.com/free-vector/blue-circle-with-white-user_78370-4707.jpg?semt=ais_hybrid&w=740&q=80',
      },
      phone: {
        type: String,
        validate: {
          validator: (v) => /^\+?[0-9]{7,15}$/.test(v),
          message: 'Invalid phone number',
        },
        index: true,
      },
      
      location: {
        country: { type: String, default: 'Kenya' },
        city: { type: String, default: '' },
        coordinates: {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: { type: [Number], default: [36.8219, -1.2921] },
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
        website: { type: String, default: '' },
      },
      profileCompleteness: {
        type: Number,
        default: 0,
      },

      recipient_code: { type: String, default: null },  // Paystack only; remove post-migration
      mobileMoneyDetails: {
        provider: { type: String, enum: ['M-Pesa'], default: 'M-Pesa' },
        phoneNumber: { type: String,  validate: { validator: (v) => /^\+?254[17]\d{8}$/.test(v), message: 'Invalid Kenyan M-Pesa number' } },
        accountName: { type: String,},
        verified: { type: Boolean, default: false }, // Add: Confirm via mini-STK or docs
      },
      isAdmin: {
        type: Boolean,
        default: false,
      },
      deviceToken: { type: String },
    },
    
    pushSubscription: { type: Object },
    lastSeen: { type: Date, default: Date.now },
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
      reportsSubmitted: { type: Number, default: 0 },
      reportsReceived: { type: Number, default: 0 },
    },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      reviewCount: { type: Number, default: 0 },
    },
    listings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }],
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Orders' }],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }],
    stats: {
      activeListingsCount: { type: Number, default: 0 },
      soldListingsCount: { type: Number, default: 0 },
      pendingOrdersCount: { type: Number, default: 0 },
      completedOrdersCount: { type: Number, default: 0 },
      failedOrdersCount: { type: Number, default: 0 },
      listingFeesPaid: { type: Number, default: 0 },
    },
    isFeatured: { type: Boolean, default: false },
    badges: {
      type: [String],
      enum: ['Top Seller', 'Verified', 'Fast Responder', 'New User', 'Trusted Buyer', 'Referrer'],
      default: [],
    },
    preferences: {
      emailNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: false },
      marketingEmails: { type: Boolean, default: true },
    },
    referralCode: {
      type: String,
      unique: true,
      default: () => `REF${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
    },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviews: [
      {
        reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        comment: { type: String, trim: true, maxlength: 500 },
        rating: { type: Number, min: 0, max: 5, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    financials: {
      balance: { type: Number, default: 0 },
      swiftTransferId: { type: String }, 
      payoutHistory: [
        {
          amount: { type: Number},
          date: { type: Date, default: Date.now },
          method: { type: String, enum: ['M-Pesa', 'Bank'] },
          status: { type: String, enum: ['pending', 'manual_pending', 'completed', 'failed', 'refunded'], default: 'pending' }
        },
      ],
    },
  },
  { timestamps: true }
);

// Pre-save hooks (unchanged core logic, adjusted for financials if needed)
UserSchema.pre('save', function (next) {
  if (this.isModified('reviews')) {
    const reviews = this.reviews || [];
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    this.rating.average = reviews.length ? totalRating / reviews.length : 0;
    this.rating.reviewCount = reviews.length;
  }

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


UserSchema.index({ 'personalInfo.location.coordinates': '2dsphere' });
UserSchema.index({ 'analytics.lastActive': 1 });
UserSchema.index({ 'stats.listingFeesPaid': 1 });
UserSchema.index({ 'analytics.reportsReceived': 1 });
UserSchema.index({ 'analytics.reportsSubmitted': 1 });

export const userModel = mongoose.model('User', UserSchema);