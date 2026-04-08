import { Router } from 'express';
import {
    getProfile,
    completeProfile,
    login,
    forgotPassword,
    resetPassword,
} from '../controllers/auth';
import { authenticate } from '../middleware/auth';

const router = Router();

// ── OAuth flow ───────────────────────────────────────────────────────────────
router.get('/me', authenticate, getProfile);
router.post('/complete-profile', authenticate, completeProfile);

// ── Email + password flow ────────────────────────────────────────────────────
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
