export interface JwtPayload {
    userId: string;
    email: string;
}
export interface AuthResult {
    success: boolean;
    user?: {
        id: string;
        email: string;
        name: string | null;
        phone: string | null;
    };
    token?: string;
    error?: string;
}
export declare const authService: {
    /**
     * Register a new user
     */
    register(email: string, password: string, name?: string): Promise<AuthResult>;
    /**
     * Login user
     */
    login(email: string, password: string): Promise<AuthResult>;
    /**
     * Verify JWT token and return user
     */
    verifyToken(token: string): Promise<AuthResult>;
    /**
     * Update user profile
     */
    updateProfile(userId: string, data: {
        name?: string;
        phone?: string;
    }): Promise<AuthResult>;
    /**
     * Change password
     */
    changePassword(userId: string, currentPassword: string, newPassword: string): Promise<AuthResult>;
    /**
     * Generate JWT token
     */
    generateToken(userId: string, email: string): string;
};
