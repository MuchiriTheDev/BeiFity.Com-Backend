import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  name: {
    type: String,
    required: true,
  },
  productId: {
    type: String,
  },
  size: {
    type: String,
  },
  color: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  status: {
    type: String,
    enum: ['pending', 'shipped', 'delivered', 'cancelled'], // Added 'cancelled'
    default: 'pending',
  },
  cancelled: {
    type: Boolean,
    default: false, // New field to explicitly track cancellation
  },
});

const deliveryAddressSchema = new mongoose.Schema({
  country: {
    type: String,
    default: 'Kenya',
  },
  county: String,
  constituency: String,
  nearestTown: String,
  email: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
});

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId, 
      required: true,
      unique: true, // Ensure uniqueness if orderId is a custom string
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    status: {
      type: String,
      enum: ['pending', 'shipped', 'delivered', 'cancelled'], // Added 'cancelled' at order level
      default: 'pending',
    },
    items: [itemSchema],
    deliveryAddress: deliveryAddressSchema,
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to update totalAmount if items change
orderSchema.pre('save', function (next) {
  if (this.isModified('items')) {
    this.totalAmount = this.items.reduce((sum, item) => {
      return item.cancelled ? sum : sum + item.price * item.quantity;
    }, 0);
  }
  next();
});

export const orderModel = mongoose.model('Order', orderSchema);