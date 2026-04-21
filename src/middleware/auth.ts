import { Request, Response, NextFunction } from 'express';
import { supabase } from '../db';

export interface AuthRequest extends Request {
    supabaseUser?: { id: string; email: string };
}

/**
 * Optional authentication — does NOT reject requests without a token.
 * If a valid token is provided, req.supabaseUser is populated.
 * If no token, the request continues with req.supabaseUser = undefined.
 * Use this on public routes that have extra features for logged-in users.
 */
export const optionalAuthenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(); // No token — continue as guest
    }
    const token = authHeader.split(' ')[1];
    try {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) req.supabaseUser = { id: user.id, email: user.email! };
    } catch {
        // Invalid token — continue as guest (don't block)
    }
    next();
};

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
