export declare const emailService: {
    generateToken(): string;
    sendVerificationEmail(email: string, token: string): Promise<void>;
    createVerificationToken(userId: string): Promise<string>;
};
