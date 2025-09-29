import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    swiftReference: {
      type: String,
      required: true,
      unique: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    deliveryFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    swiftServiceFee: {
      type: Number,
      required: true,
      min: 0,
    },
    netReceived: {
      type: Number,
      required: true,
      min: 0,
    },
    items: [
      {
        itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
        sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        itemAmount: { type: Number, required: true, min: 0.01 },
        sellerShare: { type: Number, required: true, min: 0 },
        platformCommission: { type: Number, required: true, min: 0 },
        transferFee: { type: Number, default: 0 },
        netCommission: { type: Number, required: true, min: 0 },
        owedAmount: { type: Number, required: true, min: 0 },
        payoutStatus: { 
          type: String, 
          enum: ['manual_pending', 'pending', 'transferred', 'failed'], 
          default: 'manual_pending' 
        },
        swiftPayoutReference: { type: String, default: null },
        deliveryConfirmed: { type: Boolean, default: false },
        refundStatus: { type: String, enum: ['none', 'pending', 'returned', 'completed'], default: 'none' },
        refundedAmount: { type: Number, default: 0, min: 0 },
        returnStatus: { type: String, enum: ['none', 'pending', 'confirmed', 'rejected'], default: 'none' },
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'swift_initiated', 'completed', 'failed', 'reversed'],
      default: 'pending',
    },
    isReversed: {
      type: Boolean,
      default: false,
    },
    paymentMethod: { type: String, default: 'M-Pesa' },
    paidAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

TransactionSchema.pre('save', function (next) {
  const commissionRate = parseFloat(process.env.COMMISSION_RATE || 0.045);
  const swiftFeeRate = parseFloat(process.env.SWIFT_FEE_RATE || 0.02); // Adjust based on SWIFT's actual fee structure
  this.swiftServiceFee = this.totalAmount * swiftFeeRate;
  this.netReceived = this.totalAmount - this.swiftServiceFee;
  this.items.forEach((item) => {
    item.platformCommission = item.itemAmount * commissionRate;
    item.sellerShare = item.itemAmount - item.platformCommission;
    item.transferFee = item.sellerShare <= 1500 ? 20 : item.sellerShare <= 20000 ? 40 : 60;
    item.netCommission = item.platformCommission - (item.itemAmount / this.totalAmount) * this.swiftServiceFee;
    if (item.netCommission < 0) item.netCommission = 0;
    item.owedAmount = item.sellerShare - item.transferFee;
    if (item.owedAmount < 0) item.owedAmount = 0;
    item.payoutStatus = 'manual_pending'; // Default to manual for no auto-splits
    if (!item.refundStatus) item.refundStatus = 'none';
    if (!item.refundedAmount) item.refundedAmount = 0;
    if (!item.returnStatus) item.returnStatus = 'none';
  });
  this.updatedAt = Date.now();
  next();
});

TransactionSchema.index({ orderId: 1 });
TransactionSchema.index({ 'items.sellerId': 1 });
TransactionSchema.index({ 'items.payoutStatus': 1 });
TransactionSchema.index({ 'items.deliveryConfirmed': 1 });
TransactionSchema.index({ 'items.refundStatus': 1 });
TransactionSchema.index({ 'items.returnStatus': 1 });
TransactionSchema.index({ 'items.owedAmount': 1 });
TransactionSchema.index({ swiftReference: 1 });

export const TransactionModel = mongoose.model('Transaction', TransactionSchema);