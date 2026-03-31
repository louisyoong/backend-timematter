import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../db';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export const signup = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password, confirmPassword, isCompany, role } = req.body;

        if (!email || !password || !confirmPassword) {
            res.status(400).json({ error: 'Missing required fields: email, password, and confirmPassword' });
            return;
        }

        if (password !== confirmPassword) {
            res.status(400).json({ error: 'Passwords do not match' });
            return;
        }

        // Check if user exists
        const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (existingUser) {
            res.status(400).json({ error: 'Email already in use' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const isCompanyBool = isCompany === 'true' || isCompany === true;
        const account_type = isCompanyBool ? 'company' : 'individual';

        let userId;

        if (!isCompanyBool) {
            // Individual sign up
            const { title, gender, dateOfBirth, ages, nationality, religion, address } = req.body;
            const files = req.files as { [fieldname: string]: Express.Multer.File[] };
            const idCardFront = files?.['identityCardFront']?.[0]?.path;
            const idCardBack = files?.['identityCardBack']?.[0]?.path;
            const profilePhoto = files?.['profilePhoto']?.[0]?.path;

            if (!title || !gender || !dateOfBirth || !ages || !nationality || !religion || !address || !idCardFront || !idCardBack) {
                res.status(400).json({ error: 'Missing required individual fields or ID card images' });
                return;
            }

            // Convert DD/MM/YYYY to YYYY-MM-DD for consistency
            let formattedDate = dateOfBirth;
            if (dateOfBirth.includes('/')) {
                const parts = dateOfBirth.split('/');
                if (parts.length === 3) {
                    formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            }

            const insertQuery = `
                INSERT INTO users (
                   account_type, email, password_hash, title, gender, dob, age, nationality, religion, address,
                   id_card_front_url, id_card_back_url, profile_photo_url, role
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const result = db.prepare(insertQuery).run(
                account_type, email, hashedPassword, title, gender, formattedDate, ages, nationality, religion, address,
                idCardFront, idCardBack, profilePhoto || null, role || 'USER'
            );
            userId = result.lastInsertRowid;

        } else {
            // Company sign up
            const { company_name, company_address } = req.body;

            if (!company_name || !company_address) {
                res.status(400).json({ error: 'Missing required company fields: company_name and company_address' });
                return;
            }

            const insertQuery = `
                INSERT INTO users (
                   account_type, email, password_hash, company_name, company_address, role
                ) VALUES (?, ?, ?, ?, ?, ?)
            `;
            const result = db.prepare(insertQuery).run(account_type, email, hashedPassword, company_name, company_address, role || 'USER');
            userId = result.lastInsertRowid;
        }

        const user = db.prepare('SELECT id, email, account_type FROM users WHERE id = ?').get(userId);
        const token = jwt.sign({ userId: user.id, email: user.email, account_type: user.account_type }, JWT_SECRET, { expiresIn: '1h' });

        res.status(201).json({ message: 'User created successfully', token, user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const token = jwt.sign({ userId: user.id, email: user.email, account_type: user.account_type }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ message: 'Login successful', token, user: { id: user.id, email: user.email, account_type: user.account_type } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;
        const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const resetToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '15m' });

        console.log(`Password reset token for ${email}: ${resetToken}`);
        res.json({ message: 'Password reset instructions sent to email (check console logs)' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}; 
