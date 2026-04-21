import { Request, Response } from 'express';
import { supabase } from '../db';
import { AuthRequest } from '../middleware/auth';

// ─── Helper ──────────────────────────────────────────────────────────────────

const uploadBase64ToSupabase = async (base64String: string, folder: string): Promise<string> => {
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let mimeType = 'image/jpeg';
    let base64Data = base64String;
    if (matches && matches.length === 3) { mimeType = matches[1]; base64Data = matches[2]; }
    if (mimeType !== 'image/png' && mimeType !== 'image/jpeg' && mimeType !== 'image/jpg')
        throw new Error('Only JPEG and PNG are allowed.');
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `${folder}/${Date.now()}-${Math.floor(Math.random() * 1000000)}.${extension}`;
    const { error } = await supabase.storage.from('avatars').upload(filename, buffer, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filename);
    return publicUrl;
};

const VALID_CATEGORIES = ['health', 'social', 'sport', 'creative', 'education'];
const VALID_PARKING    = ['free', 'paid', 'none'];
const VALID_AGE        = ['all', 'restricted'];
const VALID_STATUS     = ['draft', 'published', 'cancelled'];

// ─── POST /api/events ────────────────────────────────────────────────────────

export const createEvent = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;

        const { data: user, error: userError } = await supabase
            .from('users').select('id, role').eq('supabase_user_id', supabaseUserId).single();
        if (userError || !user) { res.status(404).json({ error: 'User not found' }); return; }

        if (!['ORGANIZER', 'ADMIN'].includes(user.role)) {
            res.status(403).json({ error: 'Only organizers can create events. Please set up your organization first.' }); return;
        }

        const { title, description, bannerImage, eventDate, location,
                parkingInfo, ageRestriction, ageMin, ageMax,
                status, category } = req.body;

        if (!title?.trim())  { res.status(400).json({ error: 'Event title is required' }); return; }
        if (!eventDate)      { res.status(400).json({ error: 'Event date is required' }); return; }

        if (category && !VALID_CATEGORIES.includes(category))
            { res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }); return; }
        if (parkingInfo && !VALID_PARKING.includes(parkingInfo))
            { res.status(400).json({ error: `parkingInfo must be one of: ${VALID_PARKING.join(', ')}` }); return; }

        const ageValue = ageRestriction || 'all';
        if (!VALID_AGE.includes(ageValue))
            { res.status(400).json({ error: "ageRestriction must be 'all' or 'restricted'" }); return; }
        if (ageValue === 'restricted' && (ageMin === undefined || ageMax === undefined))
            { res.status(400).json({ error: 'ageMin and ageMax are required when ageRestriction is restricted' }); return; }

        const { data: org } = await supabase
            .from('organizations').select('id').eq('owner_user_id', user.id).maybeSingle();

        let banner_image_url: string | null = null;
        if (bannerImage) {
            try { banner_image_url = await uploadBase64ToSupabase(bannerImage, 'event-banners'); }
            catch (err: any) { res.status(400).json({ error: `Banner upload failed: ${err.message}` }); return; }
        }

        const { data: event, error } = await supabase
            .from('events')
            .insert([{
                organizer_user_id: user.id,
                organization_id:   org?.id || null,
                title:             title.trim(),
                description:       description || null,
                banner_image_url,
                event_date:        new Date(eventDate).toISOString(),
                location:          location || null,
                parking_info:      parkingInfo || null,
                age_restriction:   ageValue,
                age_min:           ageValue === 'restricted' ? parseInt(ageMin) : null,
                age_max:           ageValue === 'restricted' ? parseInt(ageMax) : null,
                category:          category || null,
                status:            status || 'draft',
            }])
            .select().single();

        if (error) { res.status(400).json({ error: `Database error: ${error.message}` }); return; }

        res.status(201).json({ message: 'Event created successfully', event });
    } catch (err: any) {
        console.error('CreateEvent Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── GET /api/events ─────────────────────────────────────────────────────────
// Public. Only returns published events. Includes attendee count.
// Query params: category, limit (default 20), offset (default 0)

export const getEvents = async (req: Request, res: Response): Promise<void> => {
    try {
        const limit    = parseInt((req.query.limit    as string) || '20');
        const offset   = parseInt((req.query.offset   as string) || '0');
        const category = req.query.category as string | undefined;

        let query = supabase
            .from('events')
            .select(`
                id, title, description, banner_image_url, event_date,
                location, parking_info, age_restriction, age_min, age_max,
                category, status, created_at,
                organizations ( id, name, logo_url ),
                event_attendees ( id )
            `, { count: 'exact' })
            .eq('status', 'published')
            .order('event_date', { ascending: true })
            .range(offset, offset + limit - 1);

        if (category && VALID_CATEGORIES.includes(category)) {
            query = query.eq('category', category);
        }

        const { data: events, error, count } = await query;
        if (error) { res.status(500).json({ error: error.message }); return; }

        // Replace raw attendees array with a count
        const formatted = (events || []).map((e: any) => ({
            ...e,
            attendee_count: e.event_attendees?.length ?? 0,
            event_attendees: undefined,
        }));

        res.status(200).json({ events: formatted, total: count, limit, offset });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── GET /api/events/my-tickets ──────────────────────────────────────────────
// Authenticated user. Returns every event they have joined, split into
// upcoming (event_date >= now) and past (event_date < now).

export const getMyTickets = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;

        const { data: user } = await supabase
            .from('users').select('id').eq('supabase_user_id', supabaseUserId).single();
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        // Pull all event_attendees rows for this user, joined with full event data
        const { data: rows, error } = await supabase
            .from('event_attendees')
            .select(`
                joined_at,
                events (
                    id, title, description, banner_image_url,
                    event_date, location, parking_info,
                    age_restriction, age_min, age_max,
                    category, status,
                    organizations ( id, name, logo_url )
                )
            `)
            .eq('user_id', user.id)
            .order('joined_at', { ascending: false });

        if (error) { res.status(500).json({ error: error.message }); return; }

        const now = new Date();

        const upcoming: any[] = [];
        const past: any[]     = [];

        for (const row of (rows || [])) {
            const event = (row as any).events;
            if (!event) continue;

            const ticket = {
                ...event,
                joined_at: (row as any).joined_at,
            };

            if (new Date(event.event_date) >= now) {
                upcoming.push(ticket);
            } else {
                past.push(ticket);
            }
        }

        // Sort upcoming ascending (soonest first), past descending (most recent first)
        upcoming.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
        past.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());

        res.status(200).json({
            total:    (rows || []).length,
            upcoming,
            past,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── GET /api/events/mine ────────────────────────────────────────────────────
// Organizer only. Returns ALL their events (draft + published + cancelled)
// with attendee count per event.

export const getMyEvents = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;

        const { data: user } = await supabase
            .from('users').select('id').eq('supabase_user_id', supabaseUserId).single();
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        const { data: events, error } = await supabase
            .from('events')
            .select(`
                *,
                event_attendees ( id )
            `)
            .eq('organizer_user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) { res.status(500).json({ error: error.message }); return; }

        const formatted = (events || []).map((e: any) => ({
            ...e,
            attendee_count: e.event_attendees?.length ?? 0,
            event_attendees: undefined,
        }));

        res.status(200).json({ events: formatted });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── GET /api/events/user/:userId ────────────────────────────────────────────
// Public. Returns published events by a specific organizer.

export const getEventsByUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = parseInt(req.params.userId as string);
        if (isNaN(userId)) { res.status(400).json({ error: 'Invalid user ID' }); return; }

        const limit  = parseInt((req.query.limit  as string) || '20');
        const offset = parseInt((req.query.offset as string) || '0');

        const { data: organizer } = await supabase
            .from('users').select('id, name, profile_photo_url').eq('id', userId).single();
        if (!organizer) { res.status(404).json({ error: 'User not found' }); return; }

        const { data: events, error, count } = await supabase
            .from('events')
            .select(`
                id, title, description, banner_image_url, event_date,
                location, category, status, created_at,
                organizations ( id, name, logo_url ),
                event_attendees ( id )
            `, { count: 'exact' })
            .eq('organizer_user_id', userId)
            .eq('status', 'published')
            .order('event_date', { ascending: true })
            .range(offset, offset + limit - 1);

        if (error) { res.status(500).json({ error: error.message }); return; }

        const formatted = (events || []).map((e: any) => ({
            ...e,
            attendee_count: e.event_attendees?.length ?? 0,
            event_attendees: undefined,
        }));

        res.status(200).json({ organizer, events: formatted, total: count, limit, offset });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── GET /api/events/:id ─────────────────────────────────────────────────────
// Public for published events.
// Draft events are only visible to the organizer (pass auth token) or ADMIN.
// Includes attendee count. If authenticated, includes is_joined flag.

export const getEvent = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const { data: event, error } = await supabase
            .from('events')
            .select(`
                *,
                organizations ( id, name, logo_url, address ),
                event_attendees ( id, user_id )
            `)
            .eq('id', id)
            .single();

        if (error || !event) { res.status(404).json({ error: 'Event not found' }); return; }

        // Fetch organizer profile (name + photo)
        const { data: organizer } = await supabase
            .from('users')
            .select('id, name, profile_photo_url')
            .eq('id', event.organizer_user_id)
            .maybeSingle();

        // Draft/cancelled — only organizer or admin can view
        if (event.status !== 'published') {
            const supabaseUserId = req.supabaseUser?.id;
            if (!supabaseUserId) {
                res.status(404).json({ error: 'Event not found' }); return;
            }
            const { data: viewer } = await supabase
                .from('users').select('id, role').eq('supabase_user_id', supabaseUserId).single();

            const isOwner = viewer?.id === event.organizer_user_id;
            const isAdmin = viewer?.role === 'ADMIN';
            if (!isOwner && !isAdmin) {
                res.status(404).json({ error: 'Event not found' }); return;
            }
        }

        // Build response
        const attendeeCount = event.event_attendees?.length ?? 0;
        let isJoined = false;

        if (req.supabaseUser?.id) {
            const { data: viewer } = await supabase
                .from('users').select('id').eq('supabase_user_id', req.supabaseUser.id).maybeSingle();
            if (viewer) {
                isJoined = (event.event_attendees || []).some((a: any) => a.user_id === viewer.id);
            }
        }

        res.status(200).json({
            event: {
                ...event,
                organizer: organizer ?? null,
                attendee_count:  attendeeCount,
                is_joined:        isJoined,
                event_attendees:  undefined,
            }
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── POST /api/events/:id/join ───────────────────────────────────────────────
// Authenticated user joins (registers for) a published event.

export const joinEvent = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;
        const eventId = parseInt(req.params.id as string);

        const { data: user } = await supabase
            .from('users').select('id').eq('supabase_user_id', supabaseUserId).single();
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        const { data: event } = await supabase
            .from('events').select('id, status, title').eq('id', eventId).single();
        if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
        if (event.status !== 'published')
            { res.status(400).json({ error: 'Cannot join an event that is not published' }); return; }

        const { error } = await supabase
            .from('event_attendees')
            .insert([{ event_id: eventId, user_id: user.id }]);

        if (error) {
            // Unique constraint violation — already joined
            if (error.code === '23505') {
                res.status(400).json({ error: 'You have already joined this event' }); return;
            }
            res.status(500).json({ error: error.message }); return;
        }

        res.status(200).json({ message: `Successfully joined "${event.title}"` });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── DELETE /api/events/:id/join ─────────────────────────────────────────────
// Authenticated user leaves an event they previously joined.

export const leaveEvent = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;
        const eventId = parseInt(req.params.id as string);

        const { data: user } = await supabase
            .from('users').select('id').eq('supabase_user_id', supabaseUserId).single();
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        const { error } = await supabase
            .from('event_attendees')
            .delete()
            .eq('event_id', eventId)
            .eq('user_id', user.id);

        if (error) { res.status(500).json({ error: error.message }); return; }

        res.status(200).json({ message: 'You have left the event' });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── PATCH /api/events/:id ───────────────────────────────────────────────────
// Edit event. Owner or ADMIN only.

export const updateEvent = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;
        const { id } = req.params;

        const { data: user } = await supabase
            .from('users').select('id, role').eq('supabase_user_id', supabaseUserId).single();
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        const { data: event, error: fetchErr } = await supabase
            .from('events').select('*').eq('id', id).single();
        if (fetchErr || !event) { res.status(404).json({ error: 'Event not found' }); return; }

        if (event.organizer_user_id !== user.id && user.role !== 'ADMIN')
            { res.status(403).json({ error: 'You do not have permission to edit this event' }); return; }

        const updates: Record<string, any> = {};

        if (req.body.title !== undefined)          updates.title           = req.body.title;
        if (req.body.description !== undefined)    updates.description     = req.body.description || null;
        if (req.body.eventDate !== undefined)      updates.event_date      = new Date(req.body.eventDate).toISOString();
        if (req.body.location !== undefined)       updates.location        = req.body.location || null;
        if (req.body.parkingInfo !== undefined)    updates.parking_info    = req.body.parkingInfo || null;
        if (req.body.ageRestriction !== undefined) updates.age_restriction = req.body.ageRestriction;
        if (req.body.ageMin !== undefined)         updates.age_min         = req.body.ageMin ? parseInt(req.body.ageMin) : null;
        if (req.body.ageMax !== undefined)         updates.age_max         = req.body.ageMax ? parseInt(req.body.ageMax) : null;
        if (req.body.status !== undefined)         updates.status          = req.body.status;
        if (req.body.category !== undefined)       updates.category        = req.body.category || null;

        if (req.body.bannerImage) {
            try {
                if (event.banner_image_url) {
                    const oldPath = event.banner_image_url.match(/\/object\/public\/avatars\/(.+)$/)?.[1];
                    if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
                }
                updates.banner_image_url = await uploadBase64ToSupabase(req.body.bannerImage, 'event-banners');
            } catch (err: any) {
                res.status(400).json({ error: `Banner upload failed: ${err.message}` }); return;
            }
        }

        if (Object.keys(updates).length === 0)
            { res.status(400).json({ error: 'No fields provided to update' }); return; }

        updates.updated_at = new Date().toISOString();

        const { data: updated, error } = await supabase
            .from('events').update(updates).eq('id', id).select().single();
        if (error) { res.status(500).json({ error: error.message }); return; }

        res.status(200).json({ message: 'Event updated successfully', event: updated });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── DELETE /api/events/:id ──────────────────────────────────────────────────

export const deleteEvent = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;
        const { id } = req.params;

        const { data: user } = await supabase
            .from('users').select('id, role').eq('supabase_user_id', supabaseUserId).single();
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        const { data: event, error: fetchErr } = await supabase
            .from('events').select('*').eq('id', id).single();
        if (fetchErr || !event) { res.status(404).json({ error: 'Event not found' }); return; }

        if (event.organizer_user_id !== user.id && user.role !== 'ADMIN')
            { res.status(403).json({ error: 'You do not have permission to delete this event' }); return; }

        if (event.banner_image_url) {
            const path = event.banner_image_url.match(/\/object\/public\/avatars\/(.+)$/)?.[1];
            if (path) await supabase.storage.from('avatars').remove([path]);
        }

        const { error } = await supabase.from('events').delete().eq('id', id);
        if (error) { res.status(500).json({ error: error.message }); return; }

        res.status(200).json({ message: 'Event deleted successfully' });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── GET /api/events/:id/attendees ───────────────────────────────────────────
// Organizer (owner) or ADMIN only.
// Returns list of attendees { id, name, email, profile_photo_url, joined_at }

export const getAttendees = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;
        const eventId = parseInt(req.params.id as string);
        if (isNaN(eventId)) { res.status(400).json({ error: 'Invalid event ID' }); return; }

        // Resolve requesting user
        const { data: requester } = await supabase
            .from('users').select('id, role').eq('supabase_user_id', supabaseUserId).single();
        if (!requester) { res.status(404).json({ error: 'User not found' }); return; }

        // Fetch the event to verify ownership
        const { data: event } = await supabase
            .from('events').select('id, title, organizer_user_id').eq('id', eventId).single();
        if (!event) { res.status(404).json({ error: 'Event not found' }); return; }

        const isOwner = requester.id === event.organizer_user_id;
        const isAdmin = requester.role === 'ADMIN';
        if (!isOwner && !isAdmin) {
            res.status(403).json({ error: 'Only the event organizer can view the attendee list' }); return;
        }

        // Fetch attendees — join with users table for name, email, photo
        const { data: rows, error } = await supabase
            .from('event_attendees')
            .select(`
                joined_at,
                users ( id, name, email, profile_photo_url )
            `)
            .eq('event_id', eventId)
            .order('joined_at', { ascending: true });

        if (error) { res.status(500).json({ error: error.message }); return; }

        const attendees = (rows || []).map((row: any) => ({
            id:                row.users?.id,
            name:              row.users?.name || null,
            email:             row.users?.email,
            profile_photo_url: row.users?.profile_photo_url || null,
            joined_at:         row.joined_at,
        }));

        res.status(200).json({
            event_id:   eventId,
            event_title: event.title,
            total:      attendees.length,
            attendees,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};
