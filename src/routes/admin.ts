import { Router } from 'express';
import { getAllUsers, blockUser, unblockUser, deleteUser } from '../controllers/admin';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';

const router = Router();

// All admin routes require: valid OAuth token + ADMIN role
router.use(authenticate, requireAdmin);

// GET  /api/admin/users              — list all users
router.get('/users', getAllUsers);

// PATCH /api/admin/users/:id/block   — block a user
router.patch('/users/:id/block', blockUser);

// PATCH /api/admin/users/:id/unblock — unblock a user
router.patch('/users/:id/unblock', unblockUser);

// DELETE /api/admin/users/:id        — permanently delete a user + all their data
router.delete('/users/:id', deleteUser);

export default router;
