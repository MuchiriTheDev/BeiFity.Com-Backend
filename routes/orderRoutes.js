import express from 'express';
import { cancelOrderItem, getBuyerOrders, getOrders, placeOrder, updateOrderStatus } from '../controllers/orderController.js';
import { authUser } from '../middlewares/authMiddleware.js';

const orderRouter = express.Router();

orderRouter.post('/place-order', authUser, placeOrder)
orderRouter.post('/get-orders', authUser, getOrders)
orderRouter.patch('/update-status', authUser, updateOrderStatus)
orderRouter.post('/get-your-orders', getBuyerOrders)
orderRouter.post('/cancel-item', authUser, cancelOrderItem);

export default orderRouter;