import bcrypt from 'bcryptjs';
import { userModel } from '../models/User.js';
import { generateRandomNumbers, generateToken } from '../utils/helper.js';
import { tokenModel } from '../models/Token.js';
import { resetTokenModel } from '../models/ResetToken.js';
import crypto from 'crypto';
import { sendEmail } from '../utils/sendEmail.js';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import env from '../config/env.js';

const googleClient = new OAuth2Client(env.CLIENT_ID);

/**
 * Signup
 * @route POST /api/auth/signup
 * @desc Register a new user
 * @access Public
 * @body {fullname, email, password, phone, referralCode, username}
 */
export const signup = async (req, res) => {
  try {
    const { fullname, email, password, phone, referralCode, username } = req.body;

    if (!fullname || !email || !password || !phone || !username) {
      logger.warn('Signup failed: Missing required fields');
      return res.status(400).json({ success: false, message: 'Fullname, email, password, phone, and username are required' });
    }

    const existingUser = await userModel.findOne({ 'personalInfo.email': email });
    if (existingUser) {
      logger.warn(`Signup failed: Email ${email} already in use`);
      return res.status(400).json({ success: false, message: 'Email is already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new userModel({
      personalInfo: {
        fullname,
        email,
        password: hashedPassword,
        phone,
        username,
      },
    });

    // Handle referral if provided
    if (referralCode) {
      const referrer = await userModel.findOne({ referralCode });
      if (referrer) {
        newUser.referredBy = referrer._id;
        await userModel.updateOne(
          { _id: referrer._id },
          { $push: { badges: 'Referrer' }, $inc: { 'analytics.numberOfReferrals': 1 } } // Fixed increment syntax
        );
        logger.info(`Referral applied: User ${newUser._id} referred by ${referrer._id}`);
      } else {
        logger.warn(`Invalid referral code: ${referralCode}`);
      }
    }

    await newUser.save();
    logger.info(`User created: ${newUser._id}`);

    const verifyToken = new tokenModel({
      userId: newUser._id,
      token: crypto.randomBytes(32).toString('hex'),
    });
    await verifyToken.save();
    logger.debug(`Verification token created for user: ${newUser._id}`);

    const url = `${env.FRONTEND_URL}/users/verify/${newUser._id}/${verifyToken.token}`;
    await sendEmail(
      newUser.personalInfo.email,
      'Verify Your Email At BeiFity.Com',
      `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
                  <!-- Logo -->
                  <tr>
                    <td>
                      <img src="https://bei-fity-com.vercel.app/assets/logo-without-Dr_6ibJh.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                    </td>
                  </tr>
                  <!-- Heading -->
                  <tr>
                    <td>
                      <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Verify Your Email Address</h2>
                    </td>
                  </tr>
                  <!-- Greeting -->
                  <tr>
                    <td>
                      <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Hello ${newUser.personalInfo.fullname},</p>
                    </td>
                  </tr>
                  <!-- Message -->
                  <tr>
                    <td>
                      <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                        Thank you for joining <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>! Please verify your email by clicking below:
                      </p>
                    </td>
                  </tr>
                  <!-- Button -->
                  <tr>
                    <td>
                      <a href="${url}" style="display: inline-block; padding: 15px 20px; background-color: #1e40af; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 700; border-radius: 8px; margin-bottom: 30px; transition: background-color 0.3s;">Verify Email</a>
                    </td>
                  </tr>
                  <!-- Note -->
                  <tr>
                    <td>
                      <p style="font-size: 13px; color: #64748b; margin-top: 20px;">If you didn’t sign up, please ignore this email.</p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="margin-top: 30px;">
                      <p style="font-size: 14px; color: #64748b; margin: 0;">Best regards,</p>
                      <p style="font-weight: 700; color: #d97706; font-size: 16px; margin-top: 10px;">Bei<span style="color: #1e40af;">Fity.Com</span></p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>`
    );

    return res.status(201).json({
      success: true,
      message: 'An email has been sent to verify your account.',
    });
  } catch (error) {
    logger.error(`Signup error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

/**
 * Email Verification
 * @route GET /api/auth/verify/:id/:token
 * @desc Verify user’s email
 * @access Public
 * @param {string} id - User ID
 * @param {string} token - Verification token
 */
export const verification = async (req, res) => {
  try {
    const { id, token } = req.params;
    const user = await userModel.findById(id);
    if (!user) {
      logger.warn(`Verification failed: User ${id} not found`);
      return res.status(400).json({ success: false, message: 'Invalid link' });
    }

    const verifiedToken = await tokenModel.findOne({ userId: id, token });
    if (!verifiedToken) {
      logger.warn(`Verification failed: Invalid or expired token for user ${id}`);
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }

    await userModel.updateOne({ _id: id }, { 'personalInfo.verified': true });
    await verifiedToken.deleteOne();
    logger.info(`Email verified for user: ${id}`);

    await sendEmail(
      user.personalInfo.email,
      'Email Verified Successfully',
      ``
    )

    const userToken = generateToken(user._id);
    return res.status(200).json({
      success: true,
      token: userToken,
      userId: user._id,
      message: 'Email Verified Successfully',
    });
  } catch (error) {
    logger.error(`Verification error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

/**
 * Login
 * @route POST /api/auth/login
 * @desc Authenticate a user
 * @access Public
 * @body {email, password}
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      logger.warn('Login failed: Email or password missing');
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await userModel.findOne({ 'personalInfo.email': email }).select('+personalInfo.password');
    if (!user) {
      logger.warn(`Login failed: User not found for email ${email}`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(password, user.personalInfo.password);
    if (!isValidPassword) {
      logger.warn(`Login failed: Invalid password for email ${email}`);
      return res.status(400).json({ success: false, message: 'Invalid password' });
    }

    if (!user.personalInfo.verified) {
      let verificationToken = await tokenModel.findOne({ userId: user._id });
      if (!verificationToken) {
        verificationToken = new tokenModel({
          userId: user._id,
          token: crypto.randomBytes(32).toString('hex'),
        });
        await verificationToken.save();
        logger.debug(`Verification token created for unverified user: ${user._id}`);
      }

      const url = `${env.FRONTEND_URL}/users/verify/${user._id}/${verificationToken.token}`;
      await sendEmail(
        user.personalInfo.email,
        'Verify Your Email At BeiFity.Com',
        `<!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Email</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
              <tr>
                <td align="center">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
                    <!-- Logo -->
                    <tr>
                      <td>
                        <img src="https://bei-fity-com.vercel.app/assets/logo-without-Dr_6ibJh.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                      </td>
                    </tr>
                    <!-- Heading -->
                    <tr>
                      <td>
                        <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Verify Your Email Address</h2>
                      </td>
                    </tr>
                    <!-- Greeting -->
                    <tr>
                      <td>
                        <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Hello ${user.personalInfo.fullname},</p>
                      </td>
                    </tr>
                    <!-- Message -->
                    <tr>
                      <td>
                        <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                          Thank you for joining <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span>! Please verify your email by clicking below:
                        </p>
                      </td>
                    </tr>
                    <!-- Button -->
                    <tr>
                      <td>
                        <a href="${url}" style="display: inline-block; padding: 15px 20px; background-color: #1e40af; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 700; border-radius: 8px; margin-bottom: 30px; transition: background-color 0.3s;">Verify Email</a>
                      </td>
                    </tr>
                    <!-- Note -->
                    <tr>
                      <td>
                        <p style="font-size: 13px; color: #64748b; margin-top: 20px;">If you didn’t sign up, please ignore this email.</p>
                      </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                      <td style="margin-top: 30px;">
                        <p style="font-size: 14px; color: #64748b; margin: 0;">Best regards,</p>
                        <p style="font-weight: 700; color: #d97706; font-size: 16px; margin-top: 10px;">Bei<span style="color: #1e40af;">Fity.Com</span></p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>`
      );

      logger.warn(`Login failed: Email not verified for user ${user._id}`);
      return res.status(400).json({
        success: false,
        message: 'Please verify your email. A verification link has been sent.',
      });
    }

    const token = generateToken(user._id);
    await userModel.updateOne({ _id: user._id }, { 'analytics.lastActive': new Date() });
    logger.info(`User logged in: ${user._id}`);

    return res.status(200).json({
      success: true,
      message: 'Authentication successful',
      token,
      userId: user._id,
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

/**
 * Logout
 * @route POST /api/auth/logout
 * @desc Log out a user (client-side token invalidation)
 * @access Private (requires token)
 */
export const logout = async (req, res) => {
  try {
    const { token } = req.headers;
    if (!token) {
      logger.warn('Logout failed: No token provided');
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    logger.info(`User logged out: ${req.user?._id || 'unknown'}`);
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error(`Logout error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

/**
 * Login with Google
 * @route POST /api/auth/google
 * @desc Authenticate with Google OAuth
 * @access Public
 * @body {token} - Google ID token
 */
export const loginWithGoogle = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      logger.warn('Google login failed: No token provided');
      return res.status(400).json({ success: false, message: 'Google token required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: env.CLIENT_ID,
    });
    const { sub: googleId, email, name, picture } = ticket.getPayload();

    let user = await userModel.findOne({ 'personalInfo.email': email });
    if (!user) {
      user = new userModel({
        personalInfo: {
          fullname: name,
          email,
          profilePicture: picture,
          phone: '', // Prompt user to add phone later
          verified: true, // Google-verified email
        },
        analytics: { lastActive: new Date() },
      });
      await user.save();
      logger.info(`New user created via Google login: ${user._id}`);
    } else {
      await userModel.updateOne(
        { _id: user._id },
        { 'analytics.lastActive': new Date() }
      );
      logger.info(`Existing user logged in via Google: ${user._id}`);
    }

    const userToken = generateToken(user._id);
    return res.status(200).json({
      success: true,
      message: 'Google login successful',
      token: userToken,
      userId: user._id,
    });
  } catch (error) {
    logger.error(`Google login error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

/**
 * Google OAuth Callback
 * @route GET /api/auth/google/callback
 * @desc Handle Google OAuth callback
 * @access Public
 */
export const googleCallback = async (req, res) => {
  try {
    const { userId, token } = req.user; // Set by Passport strategy
    logger.info(`Google callback processed for user: ${userId}`);
    res.redirect(`${env.FRONTEND_URL}/google-auth/${userId}/verify/${token}`);
  } catch (error) {
    logger.error(`Google callback error: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, message: 'Google authentication failed' });
  }
};

/**
 * Google Auth Initialization
 * @route GET /api/auth/google
 * @desc Initialize Google OAuth login
 * @access Public
 */
export const googleAuth = (req, res, next) => {
  logger.info('Initializing Google OAuth login');
  next();
};

/**
 * Get Google User
 * @route GET /api/auth/google/user
 * @desc Get authenticated Google user data
 * @access Private (requires token)
 */
export const getGoogleUser = (req, res) => {
  if (req.user) {
    logger.info(`Google user data retrieved for user: ${req.user._id}`);
    res.status(200).json({ success: true, data: req.user });
  } else {
    logger.warn('Google user data request failed: Not authenticated');
    res.status(401).json({ success: false, message: 'Not authenticated' });
  }
};

/**
 * Logout with Google
 * @route POST /api/auth/google/logout
 * @desc Log out from Google session (client-side token handling)
 * @access Private (requires token)
 */
export const logoutWithGoogle = async (req, res) => {
  try {
    const { token } = req.headers;
    if (!token) {
      logger.warn('Google logout failed: No token provided');
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    logger.info(`User logged out from Google: ${req.user?._id || 'unknown'}`);
    return res.status(200).json({ success: true, message: 'Logged out from Google successfully' });
  } catch (error) {
    logger.error(`Google logout error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

/**
 * Get Email Reset Code
 * @route POST /api/auth/reset
 * @desc Send a password reset code to user’s email
 * @access Public
 * @body {email}
 */
export const getEmailReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      logger.warn('Password reset failed: Email missing');
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await userModel.findOne({ 'personalInfo.email': email });
    if (!user) {
      logger.warn(`Password reset failed: Email ${email} not found`);
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    await resetTokenModel.deleteMany({ userId: user._id });
    const code = generateRandomNumbers().join('');
    const resetToken = new resetTokenModel({
      userId: user._id,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await resetToken.save();
    logger.debug(`Password reset token created for user: ${user._id}`);

    const sent = await sendEmail(
      user.personalInfo.email,
      'Code Verification At BeiFity.Com',
      `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset Code</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding: 20px;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); text-align: center;">
                  <!-- Logo -->
                  <tr>
                    <td>
                      <img src="https://bei-fity-com.vercel.app/assets/logo-without-Dr_6ibJh.png" alt="BeiFity.Com Logo" style="width: auto; height: 70px; margin-bottom: 30px; display: block; margin-left: auto; margin-right: auto;">
                    </td>
                  </tr>
                  <!-- Heading -->
                  <tr>
                    <td>
                      <h2 style="font-size: 20px; font-weight: 700; color: #1e40af; margin-bottom: 20px;">Password Reset Code</h2>
                    </td>
                  </tr>
                  <!-- Greeting -->
                  <tr>
                    <td>
                      <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 25px;">Hello ${user.personalInfo.fullname || 'User'},</p>
                    </td>
                  </tr>
                  <!-- Message -->
                  <tr>
                    <td>
                      <p style="font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
                        Use this code to reset your <span style="color: #1e40af; font-weight: 600;">BeiF<span style="color: #fbbf24;">ity.Com</span></span> password:
                      </p>
                    </td>
                  </tr>
                  <!-- Code -->
                  <tr>
                    <td>
                      <div style="font-size: 25px; font-weight: 700; color: #1e40af; background-color: #f0f4f8; padding: 15px 20px; border-radius: 8px; display: inline-block; margin-bottom: 30px; letter-spacing: 5px;">[${code}]</div>
                    </td>
                  </tr>
                  <!-- Note -->
                  <tr>
                    <td>
                      <p style="font-size: 13px; color: #64748b; margin-top: 20px;">Valid for 10 minutes. Ignore if you didn’t request this.</p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="margin-top: 30px;">
                      <p style="font-size: 14px; color: #64748b; margin: 0;">Best regards,</p>
                      <p style="font-weight: 700; color: #d97706; font-size: 16px; margin-top: 10px;">Bei<span style="color: #1e40af;">Fity.Com</span></p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>`
    );

    if (sent) {
      logger.info(`Password reset code sent to email: ${email}`);
      return res.status(200).json({ success: true, message: 'Verification code sent to email' });
    }
    logger.warn(`Failed to send password reset email to: ${email}`);
    return res.status(400).json({ success: false, message: 'Email not sent, please try again' });
  } catch (error) {
    logger.error(`Password reset error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

/**
 * Verify Reset Code
 * @route POST /api/auth/reset/verify
 * @desc Verify the password reset code
 * @access Public
 * @body {email, code}
 */
export const codeVerification = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      logger.warn('Code verification failed: Email or code missing');
      return res.status(400).json({ success: false, message: 'Email and code are required' });
    }

    const user = await userModel.findOne({ 'personalInfo.email': email });
    if (!user) {
      logger.warn(`Code verification failed: Email ${email} not found`);
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    const resetToken = await resetTokenModel.findOne({
      userId: user._id,
      code,
      expiresAt: { $gt: new Date() },
    });

    if (!resetToken) {
      logger.warn(`Code verification failed: Invalid or expired code for email ${email}`);
      return res.status(401).json({ success: false, message: 'Invalid or expired code' });
    }

    await resetToken.deleteOne();
    logger.info(`Reset code verified for user: ${user._id}`);
    return res.status(200).json({ success: true, message: 'Code verified successfully' });
  } catch (error) {
    logger.error(`Code verification error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

/**
 * Change Password
 * @route POST /api/auth/reset/change
 * @desc Update user’s password after verification
 * @access Public
 * @body {email, password}
 */
export const passwordChange = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      logger.warn('Password change failed: Email or password missing');
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await userModel.findOne({ 'personalInfo.email': email });
    if (!user) {
      logger.warn(`Password change failed: Email ${email} not found`);
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await userModel.updateOne(
      { _id: user._id },
      { 'personalInfo.password': hashedPassword }
    );

    await resetTokenModel.deleteMany({ userId: user._id });
    logger.info(`Password updated for user: ${user._id}`);
    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    logger.error(`Password change error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};