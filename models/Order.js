import mongoose from 'mongoose';
import { listingModel } from './Listing.js';

const itemSchema = new mongoose.Schema({
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  quantity: { type: Number, required: true, min: 1 },
  name: { type: String, required: true },
  productId: { type: String, required: true },
  size: { type: String },
  color: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'], 
    default: 'pending' 
  },
  returnStatus: { type: String, enum: ['none', 'rejected', 'return_initiated', 'returned'], default: 'none' },
  cancelled: { type: Boolean, default: false },
  cancellationReason: {type: String, default:""},
  cancellationDetails: {type: String, default: ''},
  reportCount: { type: Number, default: 0 },
  refundStatus: { type: String, enum: ['none', 'pending', 'completed'], default: 'none' }, // Added
  refundedAmount: { type: Number, default: 0, min: 0 }, // Added
});

const deliveryAddressSchema = new mongoose.Schema({
  country: { type: String, default: 'Kenya' },
  county: { type: String, required: true },
  constituency: { type: String, required: true },
  nearestTown: { type: String, required: true },
  phone: { type: String, required: true },
});

const orderSchema = new mongoose.Schema(
  {
    orderId: { 
      type: String,  // Changed from ObjectId
      required: true,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString(),  // Generate as string
    },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0, default: 0 },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    swiftTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null }, // Parallel for migration
    status: { type: String, enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
    items: [itemSchema],
    deliveryAddress: deliveryAddressSchema,
    reportCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

orderSchema.pre('save', async function (next) {
  if (this.isModified('items') || this.isModified('deliveryFee')) {
    // Calculate total amount as item prices + delivery fee, excluding cancelled items
    const itemTotal = this.items.reduce((sum, item) => {
      return item.cancelled ? sum : sum + item.price * item.quantity;
    }, 0);
    this.totalAmount = itemTotal + (this.deliveryFee || 0);
    const itemStatuses = this.items.map(item => item.status);
    const returnStatuses = this.items.map(item => item.returnStatus);
    if (itemStatuses.every(status => status === 'delivered') && returnStatuses.every(status => status === 'none')) {
      this.status = 'delivered';
    } else if (itemStatuses.every(status => ['shipped', 'out_for_delivery', 'delivered'].includes(status)) && returnStatuses.every(status => status === 'none')) {
      this.status = 'shipped';
    } else if (itemStatuses.every(status => status === 'cancelled') || returnStatuses.every(status => status === 'returned')) {
      this.status = 'cancelled';
    } else {
      this.status = 'paid';
    }
    for (const item of this.items) {
      const listing = await listingModel.findOne({ 'productInfo.productId': item.productId });
      if (!listing || listing.productInfo.price !== item.price) {
        return next(new Error(`Invalid price for product ${item.productId}`));
      }
    }
  }
  next();
});

orderSchema.index({ reportCount: 1 });
orderSchema.index({ 'items.returnStatus': 1 });

export const orderModel = mongoose.model('Order', orderSchema);