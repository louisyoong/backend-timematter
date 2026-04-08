import { Request, Response, NextFunction } from 'express';
import { supabase } from '../db';

export interface AuthRequest extends Request {
    supabaseUser?: { id: string; email: string };
}

/**
 * Validates the Supabase OAuth access token from the Authorization header.
 * After the frontend completes OAuth (Google / Facebook / Apple via Supabase),
 * it gets a session.access_token — that token must be passed as:
 *   Authorization: Bearer <access_token>
 */
export const authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: No token provided' });
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
            return;
        }

        req.supabaseUser = { id: user.id, email: user.email! };
        next();
    } catch (err: any) {
        res.status(401).json({ error: 'Unauthorized: Token validation failed' });
    }
};
