import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { db } from '../db';
import { env } from '../env';

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

  // --- Verification ---
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;
    await transporter.sendMail({
      from: env.FROM_EMAIL,
      to: email,
      subject: 'Verify Your Email',
      html: `<p>Click here to verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
    });
  },

  async createVerificationToken(userId: string): Promise<string> {
    const token = this.generateToken();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); 
    await db.user.update({
      where: { id: userId },
      data: { verifyToken: token, verifyExpires: expires },
    });
    return token;
  },

  async verifyEmail(token: string): Promise<{ success: boolean; error?: string }> {
    const user = await db.user.findUnique({ where: { verifyToken: token } });
    if (!user) return { success: false, error: 'Invalid token' };
    if (user.verifyExpires && user.verifyExpires < new Date()) return { success: false, error: 'Expired' };
    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyToken: null, verifyExpires: null },
    });
    return { success: true };
  },

  // --- Password Reset (✅ COMPLETED) ---
  
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;
    await transporter.sendMail({
      from: env.FROM_EMAIL,
      to: email,
      subject: 'Reset Password Request',
      html: `
        <h3>Password Reset</h3>
        <p>You requested a password reset. Click below to proceed:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link expires in 1 hour.</p>
      `
    });
  },

  async initiatePasswordReset(email: string): Promise<void> {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) return; // Silent fail for security

    const token = this.generateToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetExpires: expires }
    });

    await this.sendPasswordResetEmail(email, token);
  }
};
