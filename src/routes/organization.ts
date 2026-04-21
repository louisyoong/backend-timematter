import { Router } from 'express';
import { createOrganization, getMyOrganization, updateOrganization } from '../controllers/organization';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/',    authenticate, createOrganization);   // Create organization → role becomes ORGANIZER
router.get('/me',   authenticate, getMyOrganization);    // Get current user's organization
router.patch('/',   authenticate, updateOrganization);   // Update organization details

export default router;
