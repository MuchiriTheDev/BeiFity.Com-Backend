import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  // ID of the user submitting the report (can be null if anonymous)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true,
  },

  // ID of the seller being reported
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true, // Changed to false to allow reports without a seller (e.g., product-only)
    index: true,
  },

  // Reason for the report (selected from predefined options)
  reason: {
    type: String,
    required: true,
    enum: [
      'Fraudulent Activity',
      'Non-Delivery',
      'Fake Products',
      'Inappropriate Behavior',
      'Damaged Item',
      'Wrong Item',
      'Other',
    ],
  },

  // Additional details provided by the reporter
  details: {
    type: String,
    required: false,
    trim: true,
    maxlength: 1000,
  },

  // Status of the report
  status: {
    type: String,
    enum: ['Pending', 'Under Review', 'Resolved', 'Dismissed'],
    default: 'Pending',
  },

  // Timestamp of when the report was created
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
  },

  // Timestamp of when the report was last updated
  updatedAt: {
    type: Date,
    default: Date.now,
    required: true,
  },

  // Optional: Admin notes on the report
  adminNotes: {
    type: String,
    required: false,
    trim: true,
    maxlength: 1000,
  },

  // Optional: Reference to a related order
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: false,
  },

  // Optional: Reference to a related product
  productId: {
    type: String,
    required: false,
  },

  // Flag to indicate if the report has been escalated
  escalated: {
    type: Boolean,
    default: false,
  },
});

// Pre-save hook to update the 'updatedAt' field
reportSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Compound index for efficient querying
reportSchema.index({ sellerId: 1, status: 1 });
reportSchema.index({ orderId: 1, status: 1 });
reportSchema.index({ productId: 1, status: 1 });

export const ReportModel = mongoose.model('Report', reportSchema);