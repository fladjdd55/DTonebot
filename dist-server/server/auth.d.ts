interface DeviceInfo {
    ip: string;
    userAgent: string;
}
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
    register(email: string, password: string, name?: string, device?: DeviceInfo): Promise<AuthResult>;
    login(email: string, password: string, device?: DeviceInfo, twoFactorToken?: string): Promise<AuthResult>;
    refreshToken(token: string, device: DeviceInfo): Promise<AuthResult>;
    changePassword(userId: string, current: string, newPass: string): Promise<AuthResult>;
};
export {};
