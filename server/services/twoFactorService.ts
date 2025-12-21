import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { db } from '../db';
import { env } from '../env';
import bcrypt from 'bcryptjs';

export const twoFactorService = {
  async generateSecret(userId: string, email: string) {
    const secret = speakeasy.generateSecret({
      name: `${env.TWO_FACTOR_ISSUER} (${email})`,
      issuer: env.TWO_FACTOR_ISSUER,
    });

    // Store temporarily until user confirms with a code
    await db.user.update({
      where: { id: userId },
      data: { twoFactorTempSecret: secret.base32 },
    });

    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);
    return { secret: secret.base32, qrCode };
  },

  async enableTwoFactor(userId: string, token: string) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorTempSecret) return { success: false, error: 'No 2FA setup in progress' };

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorTempSecret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) return { success: false, error: 'Invalid OTP code' };

    // Generate Backup Codes
    const backupCodes = Array.from({ length: 10 }, () => 
      Math.random().toString(36).substr(2, 8).toUpperCase()
    );
    const hashedCodes = await Promise.all(backupCodes.map(c => bcrypt.hash(c, 10)));

    await db.user.update({
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

  async verifyToken(userId: string, token: string): Promise<boolean> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorSecret) return false;

    // 1. Check TOTP
    const totpValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (totpValid) return true;

    // 2. Check Backup Codes
    for (const [index, hashedCode] of user.twoFactorBackupCodes.entries()) {
      if (await bcrypt.compare(token, hashedCode)) {
        // Remove used code
        const newCodes = [...user.twoFactorBackupCodes];
        newCodes.splice(index, 1);
        await db.user.update({ where: { id: userId }, data: { twoFactorBackupCodes: newCodes } });
        return true;
      }
    }
    return false;
  }
};
