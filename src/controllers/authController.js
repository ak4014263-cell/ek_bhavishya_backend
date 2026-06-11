import User from '../models/User.js';
import Astrologer from '../models/Astrologer.js';
import Admin from '../modules/admin/models/admin.model.js';
import jwt from 'jsonwebtoken';
import * as twilioService from '../services/twilioService.js';
import { normalizeEmail, emailLookupRegex } from '../utils/authEmail.js';

const generateToken = (id, role) => {
    const secret = process.env.JWT_SECRET || 'secret';
    return jwt.sign({ id, role }, secret, {
        expiresIn: '30d',
    });
};

export const registerUser = async (req, res) => {
    try {
        const { 
            fullName, email, password, role = 'user',
            phone, gender, dob, experience, languages, skills, categories, pseudonym,
            referralCode  // ✓ Accept referral code from signup
        } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const emailRegex = new RegExp(`^${email.trim()}$`, 'i');
        const userExists = await User.findOne({ email: emailRegex });
        const adminExists = await Admin.findOne({ email: emailRegex });

        if (userExists || adminExists) {
            return res.status(400).json({ success: false, message: 'Email is already registered with another account or role' });
        }

        // ✓ Find the referrer if referral code is provided
        let referrerId = null;
        if (referralCode && referralCode.trim()) {
            const referrer = await User.findOne({ referralCode: referralCode.trim() });
            if (referrer) {
                referrerId = referrer._id;
                console.log('✓ Referral tracked: new user referred by', referrerId);
            } else {
                console.log('✗ Invalid referral code:', referralCode);
            }
        }

        const user = await User.create({
            fullName,
            email: normalizeEmail(email) || email,
            password,
            role,
            phoneNumber: phone,
            gender,
            dob,
            referredBy: referrerId, // ✓ Store referrer
            referralCode: 'EKB' + Date.now().toString().slice(-6).toUpperCase() // ✓ Generate own referral code
        });

        // ✓ Increment referrer's referral count
        if (referrerId) {
            await User.findByIdAndUpdate(
                referrerId,
                { $inc: { referralCount: 1 } },
                { new: true }
            );
            console.log('✓ Referral count incremented for:', referrerId);
        }

        if (role === 'astrologer') {
            await Astrologer.create({ 
                userId: user._id, 
                personalDetails: { 
                    name: fullName,
                    email,
                    phone,
                    gender,
                    dob,
                    experience,
                    languages: languages || [],
                    skills: skills || [],
                    categories: categories || [],
                    pseudonym
                },
                availability: {
                    isChatAvailable: false,
                    isCallAvailable: false,
                    isVideoAvailable: false
                },
                systemStatus: {
                    isApproved: false,
                    isVerified: false
                }
            });
        }

        console.log('✓ User registered successfully:', user._id, 'Referral code:', user.referralCode);

        res.status(201).json({
            success: true,
            data: {
                _id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                referralCode: user.referralCode,
                token: generateToken(user._id, user.role),
            }
        });
    } catch (error) {
        console.error('✗ Registration error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const emailRx = emailLookupRegex(email);
        const user = await User.findOne({
            $or: [
                ...(emailRx ? [{ email: emailRx }] : []),
                { _id: (email && email.length === 24) ? email : null }
            ].filter(Boolean)
        });

        if (user && user.isDeleted) {
            return res.status(403).json({ success: false, message: 'Your account has been deleted.' });
        }

        if (user && user.status === 'Blocked') {
            return res.status(403).json({ success: false, message: 'Your account has been blocked. Contact support.' });
        }

        if (user && (await user.comparePassword(password))) {
            // Prevent astrologers and sellers from logging into the User app
            if (user.role !== 'user') {
                return res.status(403).json({ success: false, message: 'You cannot log in here with a ' + user.role + ' account' });
            }

            res.json({
                success: true,
                data: {
                    _id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                    token: generateToken(user._id, user.role),
                }
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const sendOTP = async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        if (phoneNumber === '9999999999') {
            return res.status(200).json({ success: true, message: 'OTP sent successfully (Demo)' });
        }

        const data = await twilioService.sendOTP(phoneNumber);
        res.status(200).json({ success: true, message: 'OTP sent successfully', data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const verifyOTP = async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        if (!phoneNumber || !code) {
            return res.status(400).json({ success: false, message: 'Phone number and code are required' });
        }
        
        let status;
        if (phoneNumber === '9999999999' && code === '999999') {
            status = 'approved';
        } else {
            const data = await twilioService.verifyOTP(phoneNumber, code);
            status = data.status;
        }
        
        if (status === 'approved') {
            // Find or create user
            let user = await User.findOne({ phoneNumber });
            
            if (!user) {
                // Check if there's a user with the test email who needs this phone number
                // (Based on user request to test both)
                if (phoneNumber === '8989182028') {
                    user = await User.findOne({ email: 'daddy202028@gmail.com' });
                    if (user) {
                        user.phoneNumber = phoneNumber;
                        await user.save();
                    }
                }
            }

            if (user && user.isDeleted) {
                return res.status(403).json({ success: false, message: 'Your account has been deleted.' });
            }

            if (user && user.status === 'Blocked') {
                return res.status(403).json({ success: false, message: 'Your account has been blocked. Contact support.' });
            }

            if (!user) {
                // If still no user, create a new one (Optional: handle registration flow)
                user = await User.create({
                    fullName: 'New User',
                    phoneNumber,
                    role: 'user'
                });
            }

            res.status(200).json({ 
                success: true, 
                message: 'OTP verified successfully',
                data: {
                    _id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                    token: generateToken(user._id, user.role),
                }
            });
        } else {
            res.status(400).json({ success: false, message: 'Invalid OTP' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
