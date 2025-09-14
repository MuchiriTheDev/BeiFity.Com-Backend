import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    paystackReference: {
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
    paystackFee: {
      type: Number,
      required: true,
      min: 0,
    },
    netAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    items: [
      {
        itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
        sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        subaccountCode: { type: String, required: true },
        itemAmount: { type: Number, required: true, min: 0.01 },
        sellerShare: { type: Number, required: true, min: 0 },
        platformCommission: { type: Number, required: true, min: 0 },
        transferFee: { type: Number, default: 0 },
        netCommission: { type: Number, required: true, min: 0 },
        payoutStatus: { type: String, enum: ['pending', 'transferred', 'failed'], default: 'pending' },
        payoutReference: { type: String, default: null },
        deliveryConfirmed: { type: Boolean, default: false },
        refundStatus: { type: String, enum: ['none', 'pending', 'returned', 'completed'], default: 'none' },
        refundedAmount: { type: Number, default: 0, min: 0 },
        returnStatus: { type: String, enum: ['none', 'pending', 'confirmed', 'rejected'], default: 'none' },
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'reversed'],
      default: 'pending',
    },
    isReversed: {
      type: Boolean,
      default: false,
    },
    paymentMethod: { type: String },
    paidAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

TransactionSchema.pre('save', function (next) {
  const commissionRate = parseFloat(process.env.COMMISSION_RATE || 0.045);
  this.paystackFee = this.totalAmount * 0.015;
  this.netAmount = this.totalAmount - this.paystackFee;
  this.items.forEach((item) => {
    item.platformCommission = item.itemAmount * commissionRate;
    item.sellerShare = item.itemAmount - item.platformCommission;
    item.transferFee = item.sellerShare <= 1500 ? 20 : item.sellerShare <= 20000 ? 40 : 60;
    item.netCommission = item.platformCommission - (item.itemAmount / this.totalAmount) * this.paystackFee;
    if (item.netCommission < 0) item.netCommission = 0;
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
TransactionSchema.index({ paystackReference: 1 });

export const TransactionModel = mongoose.model('Transaction', TransactionSchema);