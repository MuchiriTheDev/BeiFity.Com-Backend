import 'dotenv/config';

const corsOptions = {
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL : '*',
  methods: ['GET', 'POST', 'OPTIONS', 'PATCH', 'DELETE', 'PUT'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'token'],
};

export default corsOptions;