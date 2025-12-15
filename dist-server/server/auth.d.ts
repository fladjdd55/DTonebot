export interface AuthResult {
    success: boolean;
    user?: {
        id: string;
        email: string;
        name: string | null;
        phone: string | null;
    };
    accessToken?: string;
    refreshToken?: string;
    error?: string;
}
export declare const authService: {
    register(email: string, password: string, name?: string): Promise<AuthResult>;
    login(email: string, password: string): Promise<AuthResult>;
    refreshToken(token: string): Promise<AuthResult>;
    revokeToken(token: string): Promise<{
        success: boolean;
    }>;
    updateProfile(userId: string, data: {
        name?: string;
        phone?: string;
    }): Promise<AuthResult>;
    changePassword(userId: string, current: string, newPass: string): Promise<AuthResult>;
};
