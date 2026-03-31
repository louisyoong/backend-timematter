import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export interface AuthRequest extends Request {
    user?: any;
}

export const authenticateJWT = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const token = req.header('Authorization')?.split(' ')[1];

    if (token) {
        jwt.verify(token, process.env.JWT_SECRET as string, (err, user) => {
            if (err) {
                res.status(403).json({ error: 'Forbidden' });
                return;
            }
            req.user = user;
            next();
        });
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};
