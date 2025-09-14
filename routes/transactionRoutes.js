import express from 'express';
import { createSubaccount } from '../controllers/paystackController.js';

const transactionRouter = express.Router(); 

transactionRouter.post('/subaccount', createSubaccount);
// transactionRouter.get('/verify/:reference', verifyPayment);

export default transactionRouter;