import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' }); // local secrets (gitignored)
dotenv.config();                        // fallback to .env

const supabaseUrl        = process.env.SUPABASE_URL             || '';
const supabaseAnonKey    = process.env.SUPABASE_KEY             || '';
const serviceRoleKey     = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!serviceRoleKey) {
    console.warn('[db] WARNING: SUPABASE_SERVICE_ROLE_KEY is not set. Falling back to anon key.');
} else {
    console.log('[db] Service role key starts with:', serviceRoleKey.substring(0, 20) + '...');
}

/**
 * Anon client — used ONLY for validating user tokens (supabase.auth.getUser).
 * Do NOT use this for database queries.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * DB client — uses service role key so it bypasses RLS.
 * Use this for ALL database queries in controllers.
 * Falls back to anon client only if service role key is missing (dev warning above).
 */
export const db = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
    : createClient(supabaseUrl, supabaseAnonKey);

/**
 * Admin client — same as db, kept for backwards compatibility
 * (used for deleting Supabase Auth users).
 */
export const supabaseAdmin = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
    : null;

export default db;
