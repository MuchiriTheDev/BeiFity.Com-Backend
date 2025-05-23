import nodemailer from "nodemailer";
import env from "../config/env.js";

export const sendEmail = async (email, subject, text) => {
  try {

    // Create transporter
    const transporter = nodemailer.createTransport({
      service: env.EMAIL_SERVICE, // Service name (e.g., Gmail)
      auth: {
        user: env.USER, // Your email address
        pass: env.PASS, // Your email password or app-specific password
      },
    });

    // Send email
    const mailOptions = {
      from: `"BeiFity.Com" <${env.USER}>`, // Sender address
      to: email, // Recipient address
      subject: subject, // Email subject
      html: text, // Email body
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.response);
    return true
  } catch (error) {
    console.error("Error sending email:", error);
    return false
  }
};