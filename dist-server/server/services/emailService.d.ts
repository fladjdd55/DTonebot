export declare const emailService: {
    generateToken(): string;
    sendVerificationEmail(email: string, token: string): Promise<void>;
    createVerificationToken(userId: string): Promise<string>;
    verifyEmail(token: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    sendPasswordResetEmail(email: string, token: string): Promise<void>;
    initiatePasswordReset(email: string): Promise<void>;
};
