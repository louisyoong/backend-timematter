import { Router } from 'express';
import {
    createEvent, getEvents, getMyEvents, getEventsByUser,
    getEvent, updateEvent, deleteEvent,
    joinEvent, leaveEvent, getAttendees, getMyTickets,
} from '../controllers/event';
import { authenticate, optionalAuthenticate } from '../middleware/auth';

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/',               getEvents);                        // All published events (+ category filter)
router.get('/user/:userId',   getEventsByUser);                  // Published events by a specific organizer

// ── Attendee ──────────────────────────────────────────────────────────────────
router.get('/my-tickets',     authenticate, getMyTickets);       // Events this user has joined (upcoming + past)

// ── Organizer ─────────────────────────────────────────────────────────────────
router.get('/mine',           authenticate, getMyEvents);        // Own events (all statuses + attendee counts)
router.post('/',              authenticate, createEvent);        // Create event
router.patch('/:id',          authenticate, updateEvent);        // Edit event (or toggle draft/published)
router.delete('/:id',         authenticate, deleteEvent);        // Delete event

// ── Single event (auth optional — needed for draft access + is_joined) ────────
router.get('/:id',            optionalAuthenticate, getEvent);

// ── Join / Leave ──────────────────────────────────────────────────────────────
router.post('/:id/join',      authenticate, joinEvent);          // Join event
router.delete('/:id/join',    authenticate, leaveEvent);         // Leave event

// ── Attendees (organizer/admin only) ─────────────────────────────────────────
router.get('/:id/attendees',  authenticate, getAttendees);       // List attendees

export default router;
