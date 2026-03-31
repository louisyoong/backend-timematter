import { Router } from 'express';
import { signup, login, forgotPassword } from '../controllers/auth';
import { upload } from '../middleware/upload';

const router = Router();

router.post('/signup', upload.fields([
    { name: 'identityCardFront', maxCount: 1 },
    { name: 'identityCardBack', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 }
]), signup);

router.post('/login', login);
router.post('/forgot-password', forgotPassword);

export default router;
