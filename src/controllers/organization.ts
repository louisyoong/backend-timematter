import { Response } from 'express';
import { supabase } from '../db';
import { AuthRequest } from '../middleware/auth';

const uploadBase64ToSupabase = async (base64String: string, folder: string): Promise<string> => {
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let mimeType = 'image/jpeg';
    let base64Data = base64String;
    if (matches && matches.length === 3) { mimeType = matches[1]; base64Data = matches[2]; }
    let extension = mimeType === 'image/png' ? 'png' : 'jpg';
    if (mimeType !== 'image/png' && mimeType !== 'image/jpeg' && mimeType !== 'image/jpg')
        throw new Error('Only JPEG and PNG are allowed.');
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `${folder}/${Date.now()}-${Math.floor(Math.random() * 1000000)}.${extension}`;
    const { error } = await supabase.storage.from('avatars').upload(filename, buffer, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filename);
    return publicUrl;
};

// ─── POST /api/organizations ─────────────────────────────────────────────────

/**
 * Creates an organization for the current user and upgrades their role to ORGANIZER.
 * Each user can only have one organization.
 */
export const createOrganization = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;

        // Get our internal user id
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, role')
            .eq('supabase_user_id', supabaseUserId)
            .single();

        if (userError || !user) {
            res.status(404).json({ error: 'User profile not found. Please complete your profile first.' });
            return;
        }

        // Check if they already have an organization
        const { data: existing } = await supabase
            .from('organizations')
            .select('id')
            .eq('owner_user_id', user.id)
            .maybeSingle();

        if (existing) {
            res.status(400).json({ error: 'You already have an organization. Use PATCH /api/organizations to update it.' });
            return;
        }

        const { name, description, address, logo } = req.body;

        if (!name || !name.trim()) {
            res.status(400).json({ error: 'Organization name is required' });
            return;
        }

        let logo_url: string | null = null;
        if (logo) {
            try {
                logo_url = await uploadBase64ToSupabase(logo, 'org-logos');
            } catch (err: any) {
                res.status(400).json({ error: `Logo upload failed: ${err.message}` });
                return;
            }
        }

        // Create organization
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .insert([{ owner_user_id: user.id, name: name.trim(), description: description || null, address: address || null, logo_url }])
            .select()
            .single();

        if (orgError) {
            res.status(500).json({ error: `Database error: ${orgError.message}` });
            return;
        }

        // Upgrade user role to ORGANIZER (keep ADMIN if already admin)
        if (user.role !== 'ADMIN') {
            await supabase.from('users').update({ role: 'ORGANIZER' }).eq('id', user.id);
        }

        res.status(201).json({ message: 'Organization created successfully', organization: org });
    } catch (err: any) {
        console.error('CreateOrganization Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── GET /api/organizations/me ───────────────────────────────────────────────

export const getMyOrganization = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;

        const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('supabase_user_id', supabaseUserId)
            .single();

        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        const { data: org, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('owner_user_id', user.id)
            .maybeSingle();

        if (error) { res.status(500).json({ error: error.message }); return; }

        if (!org) {
            res.status(200).json({ organization: null, has_organization: false });
            return;
        }

        res.status(200).json({ organization: org, has_organization: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── PATCH /api/organizations ────────────────────────────────────────────────

export const updateOrganization = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;

        const { data: user } = await supabase
            .from('users').select('id').eq('supabase_user_id', supabaseUserId).single();
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        const { data: org } = await supabase
            .from('organizations').select('*').eq('owner_user_id', user.id).maybeSingle();
        if (!org) { res.status(404).json({ error: 'Organization not found' }); return; }

        const updates: Record<string, any> = {};
        if (req.body.name !== undefined)        updates.name        = req.body.name;
        if (req.body.description !== undefined) updates.description = req.body.description || null;
        if (req.body.address !== undefined)     updates.address     = req.body.address || null;

        if (req.body.logo) {
            try {
                if (org.logo_url) {
                    const oldPath = org.logo_url.match(/\/object\/public\/avatars\/(.+)$/)?.[1];
                    if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
                }
                updates.logo_url = await uploadBase64ToSupabase(req.body.logo, 'org-logos');
            } catch (err: any) {
                res.status(400).json({ error: `Logo upload failed: ${err.message}` }); return;
            }
        }

        if (Object.keys(updates).length === 0) {
            res.status(400).json({ error: 'No fields provided to update' }); return;
        }

        updates.updated_at = new Date().toISOString();

        const { data: updated, error } = await supabase
            .from('organizations').update(updates).eq('id', org.id).select().single();

        if (error) { res.status(500).json({ error: error.message }); return; }

        res.status(200).json({ message: 'Organization updated', organization: updated });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};
