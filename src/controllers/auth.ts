import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { supabase } from '../db';
import { AuthRequest } from '../middleware/auth';
import { sendVerificationEmail } from '../utils/email';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Uploads a Base64 image string to Supabase Storage and returns the public URL.
 * Accepts JPEG and PNG only.
 */
const uploadBase64ToSupabase = async (base64String: string, folder: string): Promise<string> => {
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let mimeType = 'image/jpeg';
    let base64Data = base64String;

    if (matches && matches.length === 3) {
        mimeType = matches[1];
        base64Data = matches[2];
    }

    let extension = 'jpg';
    if (mimeType === 'image/png') extension = 'png';
    else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') extension = 'jpg';
    else throw new Error('Invalid file type. Only JPEG and PNG are allowed.');

    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `${folder}/${Date.now()}-${Math.floor(Math.random() * 1000000)}.${extension}`;

    const { error } = await supabase.storage
        .from('avatars')
        .upload(filename, buffer, { contentType: mimeType, upsert: true });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filename);
    return publicUrl;
};

/**
 * Formats a dd/mm/yyyy date string to yyyy-mm-dd for PostgreSQL.
 */
const formatDate = (raw: string): string => {
    if (raw.includes('/')) {
        const parts = raw.split('/');
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return raw;
};

// ─── GET /api/auth/me ────────────────────────────────────────────────────────

/**
 * Returns the current user's profile from our custom users table.
 * If no profile exists yet (first OAuth login), returns profile_complete: false.
 */
export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('supabase_user_id', supabaseUserId)
            .maybeSingle();

        if (error) {
            res.status(500).json({ error: `Database error: ${error.message}` });
            return;
        }

        if (!user) {
            // OAuth login succeeded but profile not filled yet
            res.status(200).json({
                profile_complete: false,
                email: req.supabaseUser!.email,
            });
            return;
        }

        // Block check — blocked users cannot access the app
        if (user.is_blocked) {
            res.status(403).json({
                error: 'Your account has been blocked. Please contact support.',
                is_blocked: true,
            });
            return;
        }

        res.status(200).json({ profile_complete: user.profile_complete, user, role: user.role });
    } catch (err: any) {
        console.error('GetProfile Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── POST /api/auth/complete-profile ────────────────────────────────────────

/**
 * Called after OAuth sign-in to save the user's profile information.
 * If the profile already exists it will be updated (idempotent).
 *
 * Individual fields:  title, gender, dateOfBirth (dd/mm/yyyy), age,
 *                     nationality, religion, address,
 *                     profilePhoto (Base64), identityCardFront (Base64),
 *                     identityCardBack (Base64)
 *
 * Company fields:     company_name, company_address,
 *                     companyInfo (Base64 image), profilePhoto (Base64)
 *
 * isCompany (boolean / "true" / "false") switches between the two modes.
 */
export const completeProfile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const supabaseUserId = req.supabaseUser!.id;
        const email = req.supabaseUser!.email;

        const { isCompany, password, name } = req.body;
        const isCompanyBool = typeof isCompany === 'string' ? isCompany === 'true' : !!isCompany;
        const account_type = isCompanyBool ? 'company' : 'individual';

        // ── Check if profile already exists (update path) ──────────────────
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('supabase_user_id', supabaseUserId)
            .maybeSingle();

        let profileData: Record<string, any> = {
            supabase_user_id: supabaseUserId,
            email,
            account_type,
            profile_complete: true,
            role: 'USER',
            name: name || null,
        };

        // Optional password — allows the user to also log in with email+password
        if (password && typeof password === 'string' && password.length >= 6) {
            profileData.password_hash = await bcrypt.hash(password, 10);
        }

        // ── Individual profile ──────────────────────────────────────────────
        if (!isCompanyBool) {
            const {
                title, gender, dateOfBirth, age,
                nationality, religion, address,
                profilePhoto, identityCardFront, identityCardBack,
            } = req.body;

            // Required fields
            if (!dateOfBirth || !age) {
                res.status(400).json({ error: 'dateOfBirth and age are required for individual accounts' });
                return;
            }

            // Upload images
            try {
                if (!identityCardFront) {
                    res.status(400).json({ error: 'identityCardFront image is required' });
                    return;
                }
                if (!identityCardBack) {
                    res.status(400).json({ error: 'identityCardBack image is required' });
                    return;
                }

                profileData.id_card_front_url = await uploadBase64ToSupabase(identityCardFront, 'id-cards');
                profileData.id_card_back_url = await uploadBase64ToSupabase(identityCardBack, 'id-cards');

                if (profilePhoto) {
                    profileData.profile_photo_url = await uploadBase64ToSupabase(profilePhoto, 'profiles');
                }
            } catch (uploadErr: any) {
                res.status(400).json({ error: `Image upload failed: ${uploadErr.message}` });
                return;
            }

            profileData = {
                ...profileData,
                title: title || null,
                gender: gender || null,
                dob: formatDate(dateOfBirth),
                age: parseInt(age),
                nationality: nationality || null,
                religion: religion || null,
                address: address || null,
            };

        // ── Company profile ─────────────────────────────────────────────────
        } else {
            const { company_name, company_address, companyInfo, profilePhoto } = req.body;

            if (!company_name) {
                res.status(400).json({ error: 'company_name is required for company accounts' });
                return;
            }

            try {
                if (companyInfo) {
                    profileData.company_info_url = await uploadBase64ToSupabase(companyInfo, 'company-docs');
                }
                if (profilePhoto) {
                    profileData.profile_photo_url = await uploadBase64ToSupabase(profilePhoto, 'profiles');
                }
            } catch (uploadErr: any) {
                res.status(400).json({ error: `Image upload failed: ${uploadErr.message}` });
                return;
            }

            profileData = {
                ...profileData,
                company_name,
                company_address: company_address || null,
            };
        }

        // ── Insert or Update ────────────────────────────────────────────────
        let savedUser: any;

        if (existingUser) {
            const { data, error } = await supabase
                .from('users')
                .update(profileData)
                .eq('supabase_user_id', supabaseUserId)
                .select()
                .single();

            if (error) {
                res.status(400).json({ error: `Database error: ${error.message}` });
                return;
            }
            savedUser = data;
        } else {
            const { data, error } = await supabase
                .from('users')
                .insert([profileData])
                .select()
                .single();

            if (error) {
                res.status(400).json({ error: `Database error: ${error.message}` });
                return;
            }
            savedUser = data;
        }

        res.status(200).json({
            message: 'Profile saved successfully',
            user: savedUser,
        });
    } catch (err: any) {
        console.error('CompleteProfile Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── POST /api/auth/login ────────────────────────────────────────────────────

/**
 * Email + password login (separate from OAuth).
 * The user must have set a password during profile completion.
 */
export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (error || !user) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }

        // User signed up with OAuth but never set a password
        if (!user.password_hash) {
            res.status(401).json({
                error: 'This account uses Google or Facebook login. Please sign in with your social account.',
            });
            return;
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }

        if (user.is_blocked) {
            res.status(403).json({
                error: 'Your account has been blocked. Please contact support.',
                is_blocked: true,
            });
            return;
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role, account_type: user.account_type },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            message: 'Login successful',
            token,
            user: { id: user.id, email: user.email, account_type: user.account_type, role: user.role },
        });
    } catch (err: any) {
        console.error('Login Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── POST /api/auth/forgot-password ─────────────────────────────────────────

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;

        if (!email) {
            res.status(400).json({ error: 'Email is required' });
            return;
        }

        const { data: user } = await supabase
            .from('users')
            .select('id, email, password_hash')
            .eq('email', email)
            .maybeSingle();

        // Always return the same message to prevent email enumeration
        const genericResponse = { message: 'If that email exists, a password reset link has been sent.' };

        if (!user || !user.password_hash) {
            res.status(200).json(genericResponse);
            return;
        }

        // Generate a short-lived reset token (15 minutes)
        const resetToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '15m' });
        const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;

        // Send reset email (non-blocking — fallback to console log if SMTP not configured)
        sendVerificationEmail(email, resetUrl).catch((err) => {
            console.log(`[ForgotPassword] Reset link for ${email}: ${resetUrl}`);
            console.error('Email send failed:', err.message);
        });

        res.status(200).json(genericResponse);
    } catch (err: any) {
        console.error('ForgotPassword Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// ─── POST /api/auth/reset-password ──────────────────────────────────────────

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            res.status(400).json({ error: 'token and newPassword are required' });
            return;
        }

        if (newPassword.length < 6) {
            res.status(400).json({ error: 'Password must be at least 6 characters' });
            return;
        }

        let payload: any;
        try {
            payload = jwt.verify(token, JWT_SECRET);
        } catch {
            res.status(400).json({ error: 'Reset link is invalid or has expired. Please request a new one.' });
            return;
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const { error } = await supabase
            .from('users')
            .update({ password_hash: hashedPassword })
            .eq('id', payload.userId);

        if (error) {
            res.status(500).json({ error: `Database error: ${error.message}` });
            return;
        }

        res.status(200).json({ message: 'Password reset successfully. You can now log in.' });
    } catch (err: any) {
        console.error('ResetPassword Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};
