"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.twoFactorService = void 0;
const speakeasy_1 = __importDefault(require("speakeasy"));
const qrcode_1 = __importDefault(require("qrcode"));
const db_1 = require("../db");
const env_1 = require("../env");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
exports.twoFactorService = {
    async generateSecret(userId, email) {
        const secret = speakeasy_1.default.generateSecret({
            name: `${env_1.env.TWO_FACTOR_ISSUER} (${email})`,
            issuer: env_1.env.TWO_FACTOR_ISSUER,
        });
        // Store temporarily until user confirms with a code
        await db_1.db.user.update({
            where: { id: userId },
            data: { twoFactorTempSecret: secret.base32 },
        });
        const qrCode = await qrcode_1.default.toDataURL(secret.otpauth_url);
        return { secret: secret.base32, qrCode };
    },
    async enableTwoFactor(userId, token) {
        const user = await db_1.db.user.findUnique({ where: { id: userId } });
        if (!user?.twoFactorTempSecret)
            return { success: false, error: 'No 2FA setup in progress' };
        const verified = speakeasy_1.default.totp.verify({
            secret: user.twoFactorTempSecret,
            encoding: 'base32',
            token,
            window: 1,
        });
        if (!verified)
            return { success: false, error: 'Invalid OTP code' };
        // Generate Backup Codes
        const backupCodes = Array.from({ length: 10 }, () => Math.random().toString(36).substr(2, 8).toUpperCase());
        const hashedCodes = await Promise.all(backupCodes.map(c => bcryptjs_1.default.hash(c, 10)));
        await db_1.db.user.update({
            where: { id: userId },
            data: {
                twoFactorEnabled: true,
                twoFactorSecret: user.twoFactorTempSecret,
                twoFactorTempSecret: null,
                twoFactorBackupCodes: hashedCodes,
            },
        });
        return { success: true, backupCodes };
    },
    async verifyToken(userId, token) {
        const user = await db_1.db.user.findUnique({ where: { id: userId } });
        if (!user?.twoFactorSecret)
            return false;
        // 1. Check TOTP
        const totpValid = speakeasy_1.default.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token,
            window: 1,
        });
        if (totpValid)
            return true;
        // 2. Check Backup Codes
        for (const [index, hashedCode] of user.twoFactorBackupCodes.entries()) {
            if (await bcryptjs_1.default.compare(token, hashedCode)) {
                // Remove used code
                const newCodes = [...user.twoFactorBackupCodes];
                newCodes.splice(index, 1);
                await db_1.db.user.update({ where: { id: userId }, data: { twoFactorBackupCodes: newCodes } });
                return true;
            }
        }
        return false;
    }
};
