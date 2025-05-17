import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library';
import env from '../config/env.js';
import logger from '../utils/logger.js';
// Generate JWT token
export const generateToken = (id) => {
  const token = jwt.sign(
    {
      _id: id, // Match the payload structure expected by authUser
    },
    env.SECRET_KEY, // Use the same secret key as authUser
  );
  return token;
};

// Fetch Google user data
export const getUserData = async (access_token) => {
  try {
    const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${access_token}`);
    if (!response.ok) {
      throw new Error(`Google API error: ${response.statusText}`);
    }
    const data = await response.json();
    logger.debug('Fetched Google user data', { email: data.email });
    return data;
  } catch (error) {
    logger.error(`Error fetching Google user data: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

// Generate random 6-digit number array
export const generateRandomNumbers = () => {
  const numbers = [];
  for (let i = 0; i < 6; i++) {
    numbers.push(Math.floor(Math.random() * 9) + 1); // Generates a number between 1 and 9
  }
  return numbers;
};
