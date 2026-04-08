import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Standard client — used for all normal DB operations
export const supabase = createClient(supabaseUrl, supabaseKey);

// Admin client — used only for privileged auth operations (e.g. deleting auth users)
// Requires SUPABASE_SERVICE_ROLE_KEY in .env (found in Supabase Dashboard → Settings → API)
export const supabaseAdmin = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
    : null;

export default supabase;
