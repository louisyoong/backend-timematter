import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import organizationRoutes from './routes/organization';
import eventRoutes from './routes/event';
import articleRoutes from './routes/article';

dotenv.config({ path: '.env.local' }); // local secrets (gitignored)
dotenv.config();                        // fallback to .env

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/uploads', express.static('uploads'));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/articles', articleRoutes);

app.get('/', (req, res) => {
    res.send('API is running');
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof Error) {
        res.status(400).json({ error: err.message });
    } else {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);

    // Warn if critical env vars are missing or still placeholder
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!serviceKey || serviceKey === 'your_service_role_key_here') {
        console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY is not set — DB queries will use anon key and RLS will block writes.');
    } else {
        console.log('✅  Service role key loaded.');
    }
    if (!process.env.RESEND_API_KEY) {
        console.warn('⚠️  RESEND_API_KEY is not set — confirmation emails will not be sent.');
    }
});
