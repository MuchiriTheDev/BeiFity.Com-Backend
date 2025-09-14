import express from 'express'; 
import {  createSubaccount,  verifyTransactions  } from '../controllers/paystackController.js';
import { authUser } from '../middlewares/authMiddleware.js';

const paystackRouter = express.Router();

paystackRouter.post('/subaccount', authUser ,createSubaccount);
paystackRouter.get('/verify/:reference', verifyTransactions);
// paystackRouter.post('/transactions/webhook', handleWebhook);
// paystackRouter.get('/check', authUser, checkSubAccount);
// paystackRouter.get('/verify/:reference', verifyPayment);
// paystackRouter.get("/banks", fetchBanks)


export default paystackRouter;