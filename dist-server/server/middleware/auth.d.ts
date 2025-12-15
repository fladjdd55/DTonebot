import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        name?: string | null;
        phone?: string | null;
    };
}
export declare function requireAuth(req: Request, res: Response, next: NextFunction): Promise<any>;
export declare function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<any>;
