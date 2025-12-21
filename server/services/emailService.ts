import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { db } from '../db'; // Adapted import
import { env } from '../env'; // Adapted import

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export const emailService = {
  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  },

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;
    
    await transporter.sendMail({
      from: env.FROM_EMAIL,
      to: email,
      subject: 'Verify Your Email - RechargeBot',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Welcome!</h2>
          <p>Click below to verify your account:</p>
          <a href="${verifyUrl}" style="background:#4F46E5;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Verify Email</a>
          <p><small>Link expires in 24 hours.</small></p>
        </div>
      `,
    });
  },

  async createVerificationToken(userId: string): Promise<string> {
    const token = this.generateToken();
    // Expires in 24 hours
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); 

    await db.user.update({
      where: { id: userId },
      data: { verifyToken: token, verifyExpires: expires },
    });

    return token;
  },

  // ... Add Password Reset methods from your plan here ...
};
