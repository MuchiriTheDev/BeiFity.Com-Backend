import express from 'express';
import { getFinancailDetails } from '../controllers/financeController.js';
import { authUser } from '../middlewares/authMiddleware.js';

const financialRouter = express.Router();
financialRouter.get('/data', authUser, getFinancailDetails )

export default financialRouter;