import { Response, NextFunction } from 'express';
import { supabase } from '../db';
import { AuthRequest } from './auth';

/**
 * Must be used AFTER the `authenticate` middleware.
 * Checks that the calling user has role = 'ADMIN' in the users table.
 */
export const requireAdmin = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser?.id;

        if (!supabaseUserId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('role')
            .eq('supabase_user_id', supabaseUserId)
            .single();

        if (error || !user) {
            res.status(403).json({ error: 'Forbidden: profile not found' });
            return;
        }

        if (user.role !== 'ADMIN') {
            res.status(403).json({ error: 'Forbidden: admin access only' });
            return;
        }

        next();
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};
