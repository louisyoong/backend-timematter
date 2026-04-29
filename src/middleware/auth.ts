import { Request, Response, NextFunction } from 'express';
import { supabase, db } from '../db';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    supabaseUser?: { id: string; email: string };
}

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

/**
 * Resolves a token to a { id, email } user identity.
 *
 * Tries two token types in order:
 *  1. Supabase OAuth access token  → validated via supabase.auth.getUser()
 *  2. Custom JWT (email+password login) → verified with JWT_SECRET,
 *     then the matching supabase_user_id is looked up in our users table.
 *
 * Returns null if the token is invalid or the user is not found.
 */
async function resolveToken(token: string): Promise<{ id: string; email: string } | null> {
    // ── 1. Try Supabase OAuth token ──────────────────────────────────────────
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
            return { id: user.id, email: user.email! };
        }
    } catch { /* not a Supabase token — fall through */ }

    // ── 2. Try custom JWT (email+password login) ─────────────────────────────
    try {
        const payload = jwt.verify(token, JWT_SECRET) as any;

        // Custom JWT stores userId (our DB id), not supabase_user_id
        const { data: user } = await db
            .from('users')
            .select('supabase_user_id, email')
            .eq('id', payload.userId)
            .maybeSingle();

        if (user?.supabase_user_id) {
            return { id: user.supabase_user_id, email: user.email };
        }
    } catch { /* invalid or expired JWT — fall through */ }

    return null;
}

/**
 * Requires a valid token (OAuth or custom JWT).
 * Returns 401 if missing or invalid.
 */
export const authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: No token provided' });
        return;
    }

    const token = authHeader.split(' ')[1];
    const identity = await resolveToken(token);

    if (!identity) {
        res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
        return;
    }

    req.supabaseUser = identity;
    next();
};

/**
 * Optional authentication — never rejects.
 * Populates req.supabaseUser if a valid token is present, otherwise continues as guest.
 */
export const optionalAuthenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const identity = await resolveToken(token);
            if (identity) req.supabaseUser = identity;
        } catch { /* ignore — continue as guest */ }
    }

    next();
};
