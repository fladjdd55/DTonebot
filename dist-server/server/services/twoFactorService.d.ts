export declare const twoFactorService: {
    generateSecret(userId: string, email: string): Promise<{
        secret: any;
        qrCode: any;
    }>;
    enableTwoFactor(userId: string, token: string): Promise<{
        success: boolean;
        error: string;
        backupCodes?: undefined;
    } | {
        success: boolean;
        backupCodes: string[];
        error?: undefined;
    }>;
    verifyToken(userId: string, token: string): Promise<boolean>;
};
