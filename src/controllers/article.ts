import { Request, Response } from 'express';
import { db as supabase } from '../db';
import { AuthRequest } from '../middleware/auth';

// ─── GET /api/articles/mine ──────────────────────────────────────────────────
// Returns articles authored by the authenticated user.

export const getMyArticles = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;

        const { data: user } = await supabase
            .from('users').select('id').eq('supabase_user_id', supabaseUserId).single();
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        const { data, error } = await supabase
            .from('articles')
            .select(SELECT_FIELDS)
            .eq('author_user_id', user.id)
            .order('published_at', { ascending: false });

        if (error) { res.status(500).json({ error: error.message }); return; }

        res.status(200).json({ articles: (data || []).map(formatArticle), total: data?.length ?? 0 });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── PUT /api/articles/:id ───────────────────────────────────────────────────
// Author or Admin — update title, content, published_at, banner.

export const updateArticle = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;
        const id = parseInt(req.params.id as string);
        if (isNaN(id)) { res.status(400).json({ error: 'Invalid article ID' }); return; }

        const { data: user } = await supabase
            .from('users').select('id, role').eq('supabase_user_id', supabaseUserId).single();
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        // Verify ownership (or admin)
        const { data: existing } = await supabase
            .from('articles').select('id, author_user_id, banner_image_url, published_at').eq('id', id).single();
        if (!existing) { res.status(404).json({ error: 'Article not found' }); return; }

        const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
        if (existing.author_user_id !== user.id && !isAdmin) {
            res.status(403).json({ error: 'Not authorised to edit this article.' }); return;
        }

        const { title, content, bannerImage, publishedAt } = req.body;

        if (!title?.trim())   { res.status(400).json({ error: 'Title is required.' }); return; }
        if (!content?.trim()) { res.status(400).json({ error: 'Content is required.' }); return; }

        let banner_image_url: string | null = existing.banner_image_url ?? null;
        if (bannerImage && bannerImage.startsWith('data:')) {
            banner_image_url = await uploadBase64ToSupabase(bannerImage);
        }

        const { data: article, error } = await supabase
            .from('articles')
            .update({
                title:            title.trim(),
                content:          content.trim(),
                banner_image_url,
                published_at:     publishedAt || existing.published_at,
            })
            .eq('id', id)
            .select(SELECT_FIELDS)
            .single();

        if (error || !article) { res.status(500).json({ error: error?.message || 'Update failed' }); return; }

        res.status(200).json({ article: formatArticle(article) });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

const uploadBase64ToSupabase = async (base64String: string): Promise<string> => {
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let mimeType = 'image/jpeg';
    let base64Data = base64String;
    if (matches && matches.length === 3) { mimeType = matches[1]; base64Data = matches[2]; }
    if (mimeType !== 'image/png' && mimeType !== 'image/jpeg' && mimeType !== 'image/jpg')
        throw new Error('Only JPEG and PNG are allowed.');
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `articles/${Date.now()}-${Math.floor(Math.random() * 1000000)}.${extension}`;
    const { error } = await supabase.storage.from('avatars').upload(filename, buffer, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filename);
    return publicUrl;
};

const SELECT_FIELDS = `
    id, title, content, banner_image_url, published_at, created_at, claps, is_blocked,
    users ( id, name, profile_photo_url )
`;

const formatArticle = (a: any) => ({
    id:               a.id,
    title:            a.title,
    content:          a.content,
    banner_image_url: a.banner_image_url,
    published_at:     a.published_at,
    created_at:       a.created_at,
    claps:            a.claps ?? 0,
    is_blocked:       a.is_blocked ?? false,
    author: {
        id:                a.users?.id,
        name:              a.users?.name || 'Unknown',
        profile_photo_url: a.users?.profile_photo_url || null,
    },
});

// ─── GET /api/articles ───────────────────────────────────────────────────────

export const getArticles = async (req: Request, res: Response): Promise<void> => {
    try {
        const adminMode = req.query.admin === 'true';

        let query = supabase
            .from('articles')
            .select(SELECT_FIELDS)
            .order('published_at', { ascending: false });

        if (!adminMode) {
            query = query.eq('is_blocked', false);
        }

        const { data, error } = await query;

        if (error) { res.status(500).json({ error: error.message }); return; }

        res.status(200).json({ articles: (data || []).map(formatArticle), total: data?.length ?? 0 });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── GET /api/articles/:id ───────────────────────────────────────────────────

export const getArticle = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id as string);
        if (isNaN(id)) { res.status(400).json({ error: 'Invalid article ID' }); return; }

        const { data, error } = await supabase
            .from('articles')
            .select(SELECT_FIELDS)
            .eq('id', id)
            .single();

        if (error || !data) { res.status(404).json({ error: 'Article not found' }); return; }

        res.status(200).json({ article: formatArticle(data) });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── POST /api/articles/:id/clap ────────────────────────────────────────────
// Public — increments clap count by 1. No auth required.

export const clapArticle = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id as string);
        if (isNaN(id)) { res.status(400).json({ error: 'Invalid article ID' }); return; }

        const { data, error } = await supabase.rpc('increment_article_claps', { article_id: id });

        if (error) { res.status(500).json({ error: error.message }); return; }

        res.status(200).json({ claps: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── POST /api/articles ──────────────────────────────────────────────────────
// ORGANIZER or ADMIN only.

export const createArticle = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;

        const { data: user } = await supabase
            .from('users').select('id, role, name').eq('supabase_user_id', supabaseUserId).single();
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        if (!['ORGANIZER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            res.status(403).json({ error: 'Only organizers can submit articles.' }); return;
        }

        const { title, content, bannerImage, publishedAt } = req.body;

        if (!title?.trim())   { res.status(400).json({ error: 'Title is required.' }); return; }
        if (!content?.trim()) { res.status(400).json({ error: 'Content is required.' }); return; }

        let banner_image_url: string | null = null;
        if (bannerImage && bannerImage.startsWith('data:')) {
            banner_image_url = await uploadBase64ToSupabase(bannerImage);
        }

        const { data: article, error } = await supabase
            .from('articles')
            .insert([{
                author_user_id:   user.id,
                title:            title.trim(),
                content:          content.trim(),
                banner_image_url,
                published_at:     publishedAt || new Date().toISOString().split('T')[0],
                claps:            0,
            }])
            .select(SELECT_FIELDS)
            .single();

        if (error) { res.status(500).json({ error: error.message }); return; }

        res.status(201).json({ article: formatArticle(article) });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── PATCH /api/articles/:id/block ──────────────────────────────────────────
// ADMIN only — toggle is_blocked.

export const blockArticle = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;
        const id = parseInt(req.params.id as string);
        if (isNaN(id)) { res.status(400).json({ error: 'Invalid article ID' }); return; }

        const { data: user } = await supabase
            .from('users').select('role').eq('supabase_user_id', supabaseUserId).single();
        if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            res.status(403).json({ error: 'Admin access required.' }); return;
        }

        const { is_blocked } = req.body;
        const { data, error } = await supabase
            .from('articles')
            .update({ is_blocked: Boolean(is_blocked) })
            .eq('id', id)
            .select(SELECT_FIELDS)
            .single();

        if (error || !data) { res.status(404).json({ error: 'Article not found' }); return; }

        res.status(200).json({ article: formatArticle(data) });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── DELETE /api/articles/:id ────────────────────────────────────────────────
// ADMIN only.

export const deleteArticle = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;
        const id = parseInt(req.params.id as string);
        if (isNaN(id)) { res.status(400).json({ error: 'Invalid article ID' }); return; }

        const { data: user } = await supabase
            .from('users').select('role').eq('supabase_user_id', supabaseUserId).single();
        if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            res.status(403).json({ error: 'Admin access required.' }); return;
        }

        const { error } = await supabase.from('articles').delete().eq('id', id);
        if (error) { res.status(500).json({ error: error.message }); return; }

        res.status(200).json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};
