"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db"); // Adapted import
const env_1 = require("../env"); // Adapted import
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
    async sendVerificationEmail(email, token) {
        const verifyUrl = `${env_1.env.FRONTEND_URL}/verify-email?token=${token}`;
        await transporter.sendMail({
            from: env_1.env.FROM_EMAIL,
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
    async createVerificationToken(userId) {
        const token = this.generateToken();
        // Expires in 24 hours
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db_1.db.user.update({
            where: { id: userId },
            data: { verifyToken: token, verifyExpires: expires },
        });
        return token;
    },
    // ... Add Password Reset methods from your plan here ...
};
