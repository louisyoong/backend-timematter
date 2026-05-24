import { Router } from 'express';
import { getArticles, getArticle, createArticle, clapArticle, blockArticle, deleteArticle } from '../controllers/article';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/',              getArticles);                          // Public — list all articles
router.get('/:id',           getArticle);                          // Public — single article
router.post('/:id/clap',     clapArticle);                         // Public — clap
router.post('/',             authenticate, createArticle);          // Organizer/Admin only
router.patch('/:id/block',   authenticate, blockArticle);          // Admin only
router.delete('/:id',        authenticate, deleteArticle);         // Admin only

export default router;
