import express from 'express';
import { deleteImage, uploadImages } from '../controllers/cloudinaryController.js';

const cloudinaryRouter = express.Router();

cloudinaryRouter.post('/upload', uploadImages);
cloudinaryRouter.post('/delete-image', deleteImage);

export default cloudinaryRouter;