"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
const env_1 = require("../env");
const transporter = nodemailer_1.default.createTransport({
    host: env_1.env.SMTP_HOST,
    port: env_1.env.SMTP_PORT,
    secure: env_1.env.SMTP_SECURE,
    auth: {
        user: env_1.env.SMTP_USER,
        pass: env_1.env.SMTP_PASS,
    },
});
exports.emailService = {
    generateToken() {
        return crypto_1.default.randomBytes(32).toString('hex');
    },
    // --- Verification ---
    async sendVerificationEmail(email, token) {
        const verifyUrl = `${env_1.env.FRONTEND_URL}/verify-email?token=${token}`;
        await transporter.sendMail({
            from: env_1.env.FROM_EMAIL,
            to: email,
            subject: 'Verify Your Email',
            html: `<p>Click here to verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
        });
    },
    async createVerificationToken(userId) {
        const token = this.generateToken();
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db_1.db.user.update({
            where: { id: userId },
            data: { verifyToken: token, verifyExpires: expires },
        });
        return token;
    },
    async verifyEmail(token) {
        const user = await db_1.db.user.findUnique({ where: { verifyToken: token } });
        if (!user)
            return { success: false, error: 'Invalid token' };
        if (user.verifyExpires && user.verifyExpires < new Date())
            return { success: false, error: 'Expired' };
        await db_1.db.user.update({
            where: { id: user.id },
            data: { emailVerified: true, verifyToken: null, verifyExpires: null },
        });
        return { success: true };
    },
    // --- Password Reset (✅ COMPLETED) ---
    async sendPasswordResetEmail(email, token) {
        const resetUrl = `${env_1.env.FRONTEND_URL}/reset-password?token=${token}`;
        await transporter.sendMail({
            from: env_1.env.FROM_EMAIL,
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
    async initiatePasswordReset(email) {
        const user = await db_1.db.user.findUnique({ where: { email } });
        if (!user)
            return; // Silent fail for security
        const token = this.generateToken();
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await db_1.db.user.update({
            where: { id: user.id },
            data: { resetToken: token, resetExpires: expires }
        });
        await this.sendPasswordResetEmail(email, token);
    }
};
