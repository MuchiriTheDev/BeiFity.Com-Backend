import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { generateToken } from '../utils/helper.js';
import env from './env.js';
import { userModel } from '../models/User.js';

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL}/users/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("Reached here",profile)
        const email = profile.emails[0].value;
        let user = await userModel.findOne({ 'personalInfo.email': email });

        if (!user) {
          user = new userModel({
            personalInfo: {
              fullname: profile.displayName,
              email,
              password: await bcrypt.hash(profile.id, 10), // No password for OAuth users
              profilePicture: profile.photos[0].value,
              phone: '+254712345678', // Prompt user to add later
              verified: true, // Google-verified email
            },
            analytics: { lastActive: new Date() },
          });
          await user.save();
        } else {
          await userModel.updateOne(
            { _id: user._id },
            { 'analytics.lastActive': new Date() }
          );
        }

        const token = generateToken(user._id);
        return done(null, { userId: user._id, token });
      } catch (error) {
        console.error('Google Strategy Error:', error);
        return done(error, null);
      }
    }
  )
);

// Serialize user (not needed for token-based auth, but included for completeness)
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));