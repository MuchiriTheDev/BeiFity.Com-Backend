import express from 'express';
import http from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';
import session from 'express-session';
import passport from 'passport';
import cookieParser from 'cookie-parser';
import './config/passport.js';
import httpLogger from './middlewares/logger.js';
import sessionConfig from './config/session.js';
import { connectDB } from './config/db.js';
import configureCloudinary from './config/cloudinary.js';
import configureWebpush from './config/webpush.js';
import corsOptions from './config/cors.js';
import authRouter from './routes/authRoutes.js';
import userRouter from './routes/userRoutes.js';
import listingRouter from './routes/listingRoutes.js';
import messageRouter from './routes/messageRoutes.js';
import orderRouter from './routes/orderRoutes.js';
import notificationRouter from './routes/notificationsRoutes.js';
import reportRouter from './routes/reportRoutes.js';
import cloudinaryRouter from './routes/cloudinaryRoutes.js';
import logger from './utils/logger.js';
import { initializeSocket } from './utils/socket.js';
import env from './config/env.js';
import './utils/expireListings.js'

const app = express();

// Middleware
app.use(cors({
  origin: corsOptions.origin,
  methods: corsOptions.methods,
  credentials: true,
}
));
app.use(httpLogger);
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));
app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());
app.use(cookieParser());

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Configurations
connectDB();
configureCloudinary();
configureWebpush();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
initializeSocket(server, corsOptions);

// Routes
app.use('/api/users', authRouter);
app.use('/api/profile', userRouter);
app.use('/api/listings', listingRouter);
app.use('/api/chat', messageRouter);
app.use('/api/orders', orderRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/report', reportRouter);
app.use('/api/cloudinary', cloudinaryRouter);

app.get('/', (req, res) => res.send('BeiFity API is running!'));



// Start the server
const PORT =  4000;
server.listen(PORT, () => {
  logger.info(`Server running in ${env.NODE_ENV} mode on port ${PORT} --> http://localhost:${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`, { stack: err.stack });
  server.close(() => process.exit(1));
});

// Handle SIGTERM for graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});