import pino from 'pino';
import { Request, Response, NextFunction } from 'express';
export declare const logger: pino.Logger<never, boolean>;
declare global {
    namespace Express {
        interface Request {
            requestId?: string;
        }
    }
}
export declare const requestLogger: (req: Request, res: Response, next: NextFunction) => void;
