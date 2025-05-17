import mongoose from 'mongoose';
import dotenv from 'dotenv';
import env from './env.js';
import logger from '../utils/logger.js';

dotenv.config(); // Load environment variables

export const connectDB = async () => {
  try {
    const mongoURI = env.MONGO_DB_URL;

    if (!mongoURI) {
      throw new Error("❌ MONGO_DB_URL is not defined. Check your .env file or environment variables.");
    }

    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 10000, // Increased timeout (useful for slow connections)
    });

    logger.info("✅ MongoDB connected successfully");
  } catch (error) {
    logger.error("❌ MongoDB connection error:", error.message);
    console.error("❌ MongoDB connection error:", error);

    if (error.message.includes("Could not connect to any servers")) {
      logger.error("🔴 Possible Fix: Ensure your IP is whitelisted in MongoDB Atlas.");
    } else if (error.message.includes("authentication failed")) {
      logger.error("🔴 Possible Fix: Check your MongoDB username/password in .env.");
    }

    process.exit(1); // Exit process if connection fails
  }
};
