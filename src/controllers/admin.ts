import { Response } from 'express';
import { supabase, supabaseAdmin } from '../db';
import { AuthRequest } from '../middleware/auth';

/**
 * GET /api/admin/users
 * Returns all users with their block status and profile info.
 * Admin only.
 */
export const getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select(
                'id, email, account_type, role, is_blocked, profile_complete, ' +
                'title, gender, dob, age, nationality, profile_photo_url, ' +
                'company_name, created_at'
            )
            .order('created_at', { ascending: false });

        if (error) {
            res.status(500).json({ error: `Database error: ${error.message}` });
            return;
        }

        res.status(200).json({ users });
    } catch (err: any) {
        console.error('GetAllUsers Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

/**
 * PATCH /api/admin/users/:id/block
 * Blocks a user — they will be refused access on next GET /api/auth/me call.
 * Admin only. Admins cannot block other admins.
 */
export const blockUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Prevent blocking another admin
        const { data: target, error: fetchError } = await supabase
            .from('users')
            .select('role, email')
            .eq('id', id)
            .single();

        if (fetchError || !target) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (target.role === 'ADMIN') {
            res.status(403).json({ error: 'Cannot block an admin account' });
            return;
        }

        const { error } = await supabase
            .from('users')
            .update({ is_blocked: true })
            .eq('id', id);

        if (error) {
            res.status(500).json({ error: `Database error: ${error.message}` });
            return;
        }

        res.status(200).json({ message: `User ${target.email} has been blocked` });
    } catch (err: any) {
        console.error('BlockUser Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

/**
 * PATCH /api/admin/users/:id/unblock
 * Unblocks a previously blocked user.
 * Admin only.
 */
export const unblockUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const { data: target, error: fetchError } = await supabase
            .from('users')
            .select('email')
            .eq('id', id)
            .single();

        if (fetchError || !target) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const { error } = await supabase
            .from('users')
            .update({ is_blocked: false })
            .eq('id', id);

        if (error) {
            res.status(500).json({ error: `Database error: ${error.message}` });
            return;
        }

        res.status(200).json({ message: `User ${target.email} has been unblocked` });
    } catch (err: any) {
        console.error('UnblockUser Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

/**
 * DELETE /api/admin/users/:id
 * Permanently deletes a user and ALL their data:
 *   - Profile photos, ID card images, company docs from Supabase Storage
 *   - User row from the users table
 *   - Auth user from Supabase Auth (requires SUPABASE_SERVICE_ROLE_KEY in .env)
 * Admin only. Admins cannot delete other admins.
 */
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Fetch full user record
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (user.role === 'ADMIN') {
            res.status(403).json({ error: 'Cannot delete an admin account' });
            return;
        }

        // ── Delete images from Supabase Storage ─────────────────────────────
        // Extract the storage path from a full public URL
        const extractStoragePath = (url: string | null): string | null => {
            if (!url) return null;
            const match = url.match(/\/object\/public\/avatars\/(.+)$/);
            return match ? match[1] : null;
        };

        const imagePaths = [
            extractStoragePath(user.profile_photo_url),
            extractStoragePath(user.id_card_front_url),
            extractStoragePath(user.id_card_back_url),
            extractStoragePath(user.company_info_url),
        ].filter(Boolean) as string[];

        if (imagePaths.length > 0) {
            const { error: storageError } = await supabase.storage
                .from('avatars')
                .remove(imagePaths);
            if (storageError) {
                console.error('Storage cleanup warning:', storageError.message);
                // Non-fatal — continue with user deletion
            }
        }

        // ── Delete from users table ──────────────────────────────────────────
        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (deleteError) {
            res.status(500).json({ error: `Database error: ${deleteError.message}` });
            return;
        }

        // ── Delete from Supabase Auth ────────────────────────────────────────
        if (user.supabase_user_id) {
            if (supabaseAdmin) {
                const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(
                    user.supabase_user_id
                );
                if (authDeleteError) {
                    console.error('Auth user deletion warning:', authDeleteError.message);
                    // Non-fatal — DB record is already deleted
                }
            } else {
                console.warn('SUPABASE_SERVICE_ROLE_KEY not set — Supabase Auth user was NOT deleted.');
            }
        }

        res.status(200).json({ message: `User ${user.email} and all their data have been permanently deleted` });
    } catch (err: any) {
        console.error('DeleteUser Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};
