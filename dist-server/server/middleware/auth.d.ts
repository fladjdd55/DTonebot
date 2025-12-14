import { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                name: string | null;
                phone: string | null;
            };
        }
    }
}
/**
 * Required Auth Middleware
 * - Blocks request if no valid token
 * - Use for protected routes
 */
export declare function requireAuth(req: Request, res: Response, next: NextFunction): Promise<any>;
/**
 * Optional Auth Middleware
 * - Extracts user if token present, but doesn't block
 * - Use for routes that work for both guests and logged-in users
 */
export declare function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<any>;
