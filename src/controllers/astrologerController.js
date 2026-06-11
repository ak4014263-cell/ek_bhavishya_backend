import User from '../models/User.js';
import Astrologer from '../models/Astrologer.js';
import Admin from '../modules/admin/models/admin.model.js';
import Review from '../models/Review.js';
import CallSession from '../models/CallSession.js';
import ChatSession from '../models/ChatSession.js';
import Transaction from '../models/Transaction.js';
import { getIO } from '../socket/socketManager.js';
import { emitToUser } from '../utils/socketNotify.js';
import Blog from '../models/Blog.js';
import Course from '../models/Course.js';
import Note from '../models/Note.js';
import Notification from '../models/Notification.js';
import TrainingModule from '../models/TrainingModule.js';
import jwt from 'jsonwebtoken';
import {
    resolveAstrologerForUser,
    findUserByIdentifier,
    resolveLoginAstrologer,
    isApproved,
    normalizeMediaPath,
} from '../utils/astrologerLink.js';
import { normalizeStoredUploadPath, resolvePublicMediaUrl } from '../utils/uploadPaths.js';

const profileImageForClient = (stored, req) => {
    if (!stored) return null;
    const publicUrl = resolvePublicMediaUrl(stored, req);
    if (publicUrl) return publicUrl;
    return normalizeMediaPath(normalizeStoredUploadPath(stored));
};


const generateToken = (id) => {
    const secret = process.env.JWT_SECRET || 'secret';
    return jwt.sign({ id, role: 'astrologer' }, secret, {
        expiresIn: '30d',
    });
};

export const registerAstrologer = async (req, res) => {
    try {
        const { 
            name, email, phone, gender, dob, 
            experience, languages, skills, categories, 
            pseudonym, password, chatPrice, callPrice, videoPrice 
        } = req.body;

        console.log(`[Register Attempt] Email: ${email}, Phone: ${phone}, Name: ${name}`);
        console.log(`[Register Attempt] passwordProvided=${!!password}, passwordLength=${String(password || '').length}`);

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const emailRegex = new RegExp(`^${email.trim()}$`, 'i');
        const userExists = await User.findOne({ 
            $or: [
                { email: emailRegex },
                { phoneNumber: phone }
            ]
        });
        const adminExists = await Admin.findOne({ email: emailRegex });

        if (userExists || adminExists) {
            return res.status(400).json({ success: false, message: 'Email or phone number is already registered with another account or role' });
        }

        if (!password || String(password).length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        console.log(`[Register Debug] Creating new astrologer user: ${normalizedEmail}`);
        const user = await User.create({
            fullName: name,
            email: normalizedEmail,
            password,
            phoneNumber: phone,
            gender,
            dob,
            role: 'astrologer'
        });
        console.log(`[Register Debug] Stored password hash present=${!!user.password}, startsWith$2=${String(user.password || '').startsWith('$2')}`);

        // Check if astrologer profile already exists (to be safe)
        let astrologer = await Astrologer.findOne({ userId: user._id });
        if (astrologer) {
             return res.status(400).json({ success: false, message: 'Astrologer profile already exists' });
        }

        const documents = {
            aadharCard: req.files && req.files['aadharCard'] ? req.files['aadharCard'][0].path.replace(/\\/g, '/') : undefined,
            panCard: req.files && req.files['panCard'] ? req.files['panCard'][0].path.replace(/\\/g, '/') : undefined,
            educationalCertificates: req.files && req.files['educationalCertificates']
                ? req.files['educationalCertificates'].map(file => file.path.replace(/\\/g, '/'))
                : [],
        };

        // Generate unique phone if not provided (to avoid unique constraint violation)
        const uniquePhone = phone || `temp-${user._id.toString()}-${Date.now()}`;

        astrologer = await Astrologer.create({ 
            userId: user._id, 
            personalDetails: { 
                name,
                email,
                phone: uniquePhone,
                gender,
                dob,
                experience,
                languages: typeof languages === 'string' ? JSON.parse(languages) : languages || [],
                skills: typeof skills === 'string' ? JSON.parse(skills) : skills || [],
                categories: typeof categories === 'string' ? JSON.parse(categories) : categories || [],
                pseudonym
            },
            documents,
            pricing: {
                chat: chatPrice ? Number(chatPrice) : 0,
                call: callPrice ? Number(callPrice) : 0,
                video: videoPrice ? Number(videoPrice) : 0
            },
            availability: {
                isChatAvailable: false,
                isCallAvailable: false,
                isVideoAvailable: false
            },
            systemStatus: {
                isApproved: false, // Wait for admin approval
                isVerified: false
            }
        });

        res.status(201).json({
            success: true,
            message: 'Astrologer registered successfully. Pending verification.',
            _id: astrologer._id,
            name: astrologer.personalDetails.name,
            email: astrologer.personalDetails.email,
            token: generateToken(user._id),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const loginAstrologer = async (req, res) => {
    try {
        const identifier = req.body?.email || req.body?.phone || req.body?.identifier;
        const password = req.body?.password;

        if (!identifier || !password) {
            return res.status(400).json({ success: false, message: 'Email/phone and password are required' });
        }

        const { user, astrologer: prelinked } = await resolveLoginAstrologer(identifier);

        if (!user) {
            console.log(`[Astro Login] No user for identifier=${identifier}`);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (user.isDeleted) {
            return res.status(403).json({ success: false, message: 'Your account has been deleted.' });
        }

        if (['admin', 'seller'].includes(user.role)) {
            console.log(`[Astro Login] Blocked role=${user.role} email=${user.email}`);
            return res.status(401).json({
                success: false,
                message: `This email is registered as ${user.role}. Use the correct app to sign in.`,
            });
        }

        if (user.status === 'Blocked') {
            return res.status(403).json({
                success: false,
                message: 'Your account has been blocked. Contact support.',
            });
        }

        if (!user.password) {
            console.log(`[Astro Login] No password hash for ${user.email || user.phoneNumber}`);
            return res.status(401).json({
                success: false,
                message: 'Password not set for this account. Contact admin to set your password.',
            });
        }

        console.log(`[Astro Login] storedPasswordHashPresent=${!!user.password}, startsWith$2=${String(user.password || '').startsWith('$2')}`);
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            console.log(`[Astro Login] Password mismatch for ${user.email || user.phoneNumber}`);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        let astrologer = prelinked || (await resolveAstrologerForUser(user));

        if (astrologer && user.role !== 'astrologer' && !['admin', 'seller'].includes(user.role)) {
            user.role = 'astrologer';
            await user.save();
        }

        if (user.role !== 'astrologer') {
            console.log(`[Astro Login] role=${user.role} no astrologer profile for ${user.email}`);
            return res.status(401).json({ success: false, message: 'Only astrologers can login here' });
        }

        if (!astrologer) {
            console.log(`[Astro Login] Missing astrologer profile for user=${user._id}`);
            return res.status(401).json({
                success: false,
                message: 'Astrologer profile not found. Please register again or contact admin.',
            });
        }

        const approved = isApproved(astrologer);
        console.log(`[Astro Login] OK user=${user._id} astrologer=${astrologer._id}`);

        return res.status(200).json({
            success: true,
            _id: astrologer._id,
            name: user.fullName,
            email: user.email,
            role: user.role,
            pseudonym: astrologer?.personalDetails?.pseudonym,
            token: generateToken(user._id),
            isApproved: approved,
            status: astrologer.status,
            profileImage: profileImageForClient(
                astrologer.personalDetails?.profileImage,
                req
            ),
        });
    } catch (error) {
        console.error('[Astro Login] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

import { sendOtpEmail } from '../utils/emailService.js';

export const requestAstrologerOtp = async (req, res) => {
    try {
        const { email, phoneNumber } = req.body;
        const identifier = email || phoneNumber;

        if (!identifier) {
            return res.status(400).json({ success: false, message: 'Email or Phone Number is required' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

        let user = await findUserByIdentifier(identifier);
        if (!user && !identifier.includes('@')) {
            user = await User.findOne({ phoneNumber: identifier });
        }

        if (user && user.role !== 'astrologer' && ['admin', 'seller'].includes(user.role)) {
            return res.status(400).json({ success: false, message: 'This email or phone number is already registered under another role.' });
        }

        if (user && user.isDeleted) {
            return res.status(403).json({ success: false, message: 'Your account has been deleted.' });
        }

        if (!user) {
            // Check if email is already registered in Admin
            if (email) {
                const adminExists = await Admin.findOne({ email: new RegExp(`^${email.trim()}$`, 'i') });
                if (adminExists) {
                    return res.status(400).json({ success: false, message: 'This email is already registered under another role.' });
                }
            }

            user = await User.create({
                email: email || undefined,
                phoneNumber: phoneNumber || undefined,
                fullName: identifier.split('@')[0],
                role: 'astrologer'
            });
        }

        user.otp = otp;
        user.otp_expiry = otpExpiry;
        await user.save();

        // Send Email if it's an email request
        if (email) {
            await sendOtpEmail(email, otp);
        }

        res.status(200).json({ 
            success: true, 
            message: 'OTP sent successfully',
            dev_otp: otp 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const verifyAstrologerOtp = async (req, res) => {
    try {
        const { email, phoneNumber, otp } = req.body;
        const identifier = email || phoneNumber;

        if (!identifier || !otp) {
            return res.status(400).json({ success: false, message: 'Identifier and OTP are required' });
        }

        let user = await findUserByIdentifier(identifier);
        if (!user && !identifier.includes('@')) {
            user = await User.findOne({ phoneNumber: identifier });
        }

        if (user && user.isDeleted) {
            return res.status(403).json({ success: false, message: 'Your account has been deleted.' });
        }

        console.log(`[Astro OTP] Verifying for ${identifier}. Provided: ${otp}, Expected: ${user?.otp}, Expired: ${user && new Date() > user.otp_expiry}`);
        if (!user || user.otp !== otp || new Date() > user.otp_expiry) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        if (['admin', 'seller'].includes(user.role)) {
            console.log(`[OTP Verify] User ${user.email || user.phoneNumber} has role: ${user.role}, not allowed to become astrologer`);
            return res.status(403).json({ success: false, message: 'You cannot register as an astrologer with this account' });
        }

        const astrologer = await resolveAstrologerForUser(user);
        if (!astrologer) {
            console.log(`[OTP Verify] No astrologer profile found for ${user.email || user.phoneNumber}`);
            return res.status(403).json({ success: false, message: 'Please apply through the admin panel to become an astrologer' });
        }

        const approved = isApproved(astrologer);

        user.otp = undefined;
        user.otp_expiry = undefined;
        user.role = 'astrologer'; // Ensure role is set correctly
        await user.save();

        const token = generateToken(user._id);

        res.status(200).json({ 
            success: true, 
            message: 'OTP verified successfully',
            token,
            isApproved: approved,
            status: astrologer.status,
            _id: astrologer._id,
            profileImage: profileImageForClient(
                astrologer.personalDetails?.profileImage,
                req
            ),
            astrologer: {
                _id: astrologer._id,
                email: user.email,
                phone: user.phoneNumber,
                role: user.role,
                pseudonym: astrologer?.personalDetails?.pseudonym,
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAstrologerProfile = async (req, res) => {
    try {
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }
        await astrologer.populate('userId', 'fullName email phoneNumber');

        // Calculate ratings on the fly to be accurate
        const reviews = await Review.find({ astrologerId: astrologer._id });
        const totalRating = reviews.reduce((acc, curr) => acc + curr.rating, 0);
        const average = reviews.length > 0 ? (totalRating / reviews.length).toFixed(1) : "0.0";
        const negativeReviews = reviews.filter(r => r.rating <= 2).length;

        const profileData = astrologer.toObject();
        if (profileData.personalDetails?.profileImage) {
            profileData.personalDetails.profileImage = profileImageForClient(
                profileData.personalDetails.profileImage,
                req
            );
        }
        if (profileData.sampleReading?.fileUrl) {
            profileData.sampleReading.fileUrl = normalizeMediaPath(
                profileData.sampleReading.fileUrl
            );
        }
        profileData.ratings = {
            average: reviews.length > 0 ? parseFloat(average) : 0,
            count: reviews.length,
            totalReview: reviews.length,
            negativeReviewsCount: negativeReviews
        };

        res.status(200).json({ success: true, data: profileData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateAstrologerProfile = async (req, res) => {
    try {
        const { personalDetails, pricing } = req.body;

        // Build an atomic $set payload using dot-notation keys.
        // This means each API call ONLY writes the fields it provides and NEVER
        // touches any other field — profileImage stays intact during a text-only update
        // even if both calls run concurrently (Flutter sends image + text as 2 calls).
        const atomicSet = {};
        let pricingMessage = "Profile updated successfully";

        if (personalDetails) {
            // Whitelist of allowed text fields — profileImage excluded (handled separately below)
            const textFields = ['name', 'phone', 'about', 'experience', 'gender', 'dob', 'languages', 'skills', 'categories'];
            for (const key of textFields) {
                if (personalDetails[key] !== undefined) {
                    atomicSet[`personalDetails.${key}`] = personalDetails[key];
                }
            }
        }

        // If a file was uploaded with this request, set profileImage atomically
        if (req.file) {
            atomicSet['personalDetails.profileImage'] = `/uploads/${req.file.filename}`;
        }

        // Handle pricing — needs the current doc to check approval date
        if (pricing) {
            const astrologerForPricing = await Astrologer.findOne({ userId: req.user._id });
            if (!astrologerForPricing) {
                return res.status(404).json({ success: false, message: 'Astrologer not found' });
            }

            if (astrologerForPricing.status === 'Approved') {
                const approvedDate = astrologerForPricing.approvedAt || astrologerForPricing.createdAt || new Date();
                const threeMonthsLimit = new Date(approvedDate);
                threeMonthsLimit.setMonth(threeMonthsLimit.getMonth() + 3);

                if (new Date() < threeMonthsLimit) {
                    return res.status(400).json({
                        success: false,
                        message: `You cannot update or request a price change during the first 3 months of approval. Locked until ${threeMonthsLimit.toDateString()}`
                    });
                } else {
                    atomicSet['pricingUpdateRequest'] = {
                        chat: pricing.chat !== undefined ? Number(pricing.chat) : astrologerForPricing.pricing.chat,
                        call: pricing.call !== undefined ? Number(pricing.call) : astrologerForPricing.pricing.call,
                        video: pricing.video !== undefined ? Number(pricing.video) : astrologerForPricing.pricing.video,
                        status: 'Pending',
                        requestedAt: new Date()
                    };
                    pricingMessage = "Price update request submitted to admin for approval.";
                }
            } else {
                // Not yet approved — allow direct pricing update
                if (pricing.chat !== undefined) atomicSet['pricing.chat'] = Number(pricing.chat);
                if (pricing.call !== undefined) atomicSet['pricing.call'] = Number(pricing.call);
                if (pricing.video !== undefined) atomicSet['pricing.video'] = Number(pricing.video);
            }
        }

        if (Object.keys(atomicSet).length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        // Single atomic findOneAndUpdate — no race condition possible between the two
        // sequential Flutter calls (image upload + text update)
        const linked = await resolveAstrologerForUser(req.user);
        if (!linked) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        const updatedAstrologer = await Astrologer.findOneAndUpdate(
            { userId: req.user._id },
            { $set: atomicSet },
            { new: true, runValidators: false }
        );

        if (!updatedAstrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        // Sync name/phone with the User model
        if (personalDetails?.name || personalDetails?.phone) {
            const user = await User.findById(req.user._id);
            if (user) {
                if (personalDetails.name) user.fullName = personalDetails.name;
                if (personalDetails.phone) user.phoneNumber = personalDetails.phone;
                await user.save();
            }
        }

        const responseData = updatedAstrologer.toObject();
        if (responseData.personalDetails?.profileImage) {
            responseData.personalDetails.profileImage = profileImageForClient(
                responseData.personalDetails.profileImage,
                req
            );
        }

        res.status(200).json({ success: true, message: pricingMessage, data: responseData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Old and new passwords are required' });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isMatch = await user.comparePassword(oldPassword);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid old password' });
        }

        user.password = newPassword;
        await user.save();

        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { email, phoneNumber, otp, newPassword } = req.body;
        const identifier = email || phoneNumber;

        if (!identifier || !otp || !newPassword) {
            return res.status(400).json({ success: false, message: 'Email/Phone, OTP, and new password are required' });
        }

        let user = await findUserByIdentifier(identifier);
        if (!user && !identifier.includes('@')) {
            user = await User.findOne({ phoneNumber: identifier });
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Verify OTP
        if (!user.otp || user.otp !== otp || new Date() > user.otp_expiry) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        // Reset password
        user.password = newPassword;
        user.otp = undefined;
        user.otp_expiry = undefined;
        await user.save();

        res.status(200).json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const requestEmailChangeOtp = async (req, res) => {
    try {
        const { newEmail } = req.body;
        if (!newEmail) return res.status(400).json({ success: false, message: 'New email is required' });

        const existingUser = await User.findOne({ email: newEmail });
        if (existingUser) return res.status(400).json({ success: false, message: 'Email already in use' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const user = await User.findById(req.user._id);
        user.otp = otp;
        user.otp_expiry = new Date(Date.now() + 10 * 60 * 1000);
        user.pendingEmail = newEmail;
        await user.save();

        res.status(200).json({ success: true, message: 'OTP sent successfully', dev_otp: otp });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const verifyEmailChangeOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const user = await User.findById(req.user._id);

        if (!user || user.otp !== otp || new Date() > user.otp_expiry) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        const newEmail = user.pendingEmail;
        user.email = newEmail;
        user.otp = undefined;
        user.otp_expiry = undefined;
        user.pendingEmail = undefined;
        await user.save();

        const astrologer = await Astrologer.findOne({ userId: user._id });
        if (astrologer) {
            astrologer.personalDetails.email = newEmail;
            await astrologer.save();
        }

        res.status(200).json({ success: true, message: 'Email updated successfully', email: newEmail });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateAstrologerSettings = async (req, res) => {
    try {
        const { notificationSettings, privacySettings } = req.body;
        const astrologer = await resolveAstrologerForUser(req.user);

        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        if (notificationSettings && typeof notificationSettings === 'object') {
            if (!astrologer.notificationSettings) {
                astrologer.notificationSettings = {};
            }
            for (const [key, value] of Object.entries(notificationSettings)) {
                astrologer.notificationSettings[key] = value;
            }
            astrologer.markModified('notificationSettings');
        }
        if (privacySettings && typeof privacySettings === 'object') {
            if (!astrologer.privacySettings) {
                astrologer.privacySettings = {};
            }
            for (const [key, value] of Object.entries(privacySettings)) {
                astrologer.privacySettings[key] = value;
            }
            astrologer.markModified('privacySettings');
        }

        await astrologer.save();
        res.status(200).json({
            success: true,
            message: 'Settings saved successfully',
            data: {
                notificationSettings: astrologer.notificationSettings,
                privacySettings: astrologer.privacySettings,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateWebsiteSettings = async (req, res) => {
    try {
        const astrologer = await Astrologer.findOne({ userId: req.user._id });
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        const websiteData = { ...req.body };
        
        // Handle file uploads for logo and banner
        if (req.files) {
            if (req.files.logo) websiteData.logo = `/uploads/${req.files.logo[0].filename}`;
            if (req.files.bannerImage) websiteData.bannerImage = `/uploads/${req.files.bannerImage[0].filename}`;
        }

        astrologer.website = { ...astrologer.website, ...websiteData };
        await astrologer.save();
        
        res.status(200).json({ success: true, data: astrologer.website });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const uploadSampleReading = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        const fileExtension = req.file.filename.split('.').pop().toLowerCase();
        let fileType = 'text';
        if (['mp3', 'wav', 'm4a'].includes(fileExtension)) fileType = 'audio';
        else if (['pdf'].includes(fileExtension)) fileType = 'pdf';

        astrologer.sampleReading = {
            fileUrl: normalizeMediaPath(`/uploads/${req.file.filename}`),
            fileType,
            fileName: req.file.originalname || req.file.filename,
            uploadedAt: new Date()
        };

        await astrologer.save();
        res.status(200).json({ success: true, data: astrologer.sampleReading });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};




export const updateAvailability = async (req, res) => {
    try {
        const { status, nextAvailableAt } = req.body; // 'online' or 'offline'
        const astrologer = await Astrologer.findOne({ userId: req.user._id });
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        if (status) {
            astrologer.availability.status = status;
            astrologer.systemStatus.isOnline = status === 'online';
            
            // Auto-toggle services based on online status for simplicity
            const isOnline = status === 'online';
            astrologer.availability.isChatAvailable = isOnline;
            astrologer.availability.isCallAvailable = isOnline;
            astrologer.availability.isVideoAvailable = isOnline;

            if (status === 'offline') {
                astrologer.availability.lastOnlineAt = new Date();
            }
        }

        if (nextAvailableAt) {
            astrologer.availability.nextAvailableAt = new Date(nextAvailableAt);
        } else if (status === 'online') {
            // Clear nextAvailableAt if going online
            astrologer.availability.nextAvailableAt = null;
        }

        await astrologer.save();
        res.status(200).json({ success: true, message: 'Availability updated', data: astrologer });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const COMPLETED_SESSION_STATUSES = ['ended', 'completed'];

const sumSessionEarningsSince = (calls, chats, since) => {
    const inRange = (s) => {
        const at = s.endTime || s.updatedAt || s.createdAt;
        return at && new Date(at) >= since;
    };
    return (
        calls.filter(inRange).reduce((sum, c) => sum + (c.cost || 0), 0) +
        chats.filter(inRange).reduce((sum, c) => sum + (c.cost || 0), 0)
    );
};

export const getDashboardData = async (req, res) => {
    try {
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        const astrologerId = astrologer._id;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [
            pendingCalls,
            pendingChats,
            blogCount,
            courseCount,
            activeChats,
            activeCalls,
            totalCalls,
            totalChats,
            recentCalls,
            recentChats,
            completedCalls,
            completedChats,
            reviews,
        ] = await Promise.all([
            CallSession.countDocuments({ astrologerId, status: 'ringing' }),
            ChatSession.countDocuments({ astrologerId, status: 'pending' }),
            Blog.countDocuments({ astrologerId, isPublished: true }),
            Course.countDocuments({ astrologerId, status: 'Published' }),
            ChatSession.countDocuments({ astrologerId, status: { $in: ['pending', 'active'] } }),
            CallSession.countDocuments({ astrologerId, status: { $in: ['ringing', 'connecting', 'active'] } }),
            CallSession.countDocuments({ astrologerId }),
            ChatSession.countDocuments({ astrologerId }),
            CallSession.find({ astrologerId })
                .populate('userId', 'fullName profilePhoto')
                .sort({ createdAt: -1 })
                .limit(15)
                .lean(),
            ChatSession.find({ astrologerId })
                .populate('userId', 'fullName profilePhoto')
                .sort({ createdAt: -1 })
                .limit(15)
                .lean(),
            CallSession.find({ astrologerId, status: { $in: COMPLETED_SESSION_STATUSES } }).lean(),
            ChatSession.find({ astrologerId, status: { $in: COMPLETED_SESSION_STATUSES } }).lean(),
            Review.find({ astrologerId }).sort({ createdAt: -1 }).lean(),
        ]);

        const sessions = [
            ...recentCalls.map((c) => ({
                ...c,
                id: c._id.toString(),
                type: 'call',
            })),
            ...recentChats.map((c) => ({
                ...c,
                id: c._id.toString(),
                type: 'chat',
            })),
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const totalRating = reviews.reduce((acc, curr) => acc + curr.rating, 0);
        const average = reviews.length > 0 ? (totalRating / reviews.length).toFixed(1) : '0.0';
        const negativeReviews = reviews.filter((r) => r.rating <= 2).length;

        const lifetimeEarnings =
            completedCalls.reduce((sum, c) => sum + (c.cost || 0), 0) +
            completedChats.reduce((sum, c) => sum + (c.cost || 0), 0);
        const todayEarnings = sumSessionEarningsSince(completedCalls, completedChats, startOfToday);
        const monthEarnings = sumSessionEarningsSince(completedCalls, completedChats, startOfMonth);
        const activeSessionsCount = activeChats + activeCalls;

        const data = {
            balance: astrologer.walletBalance || 0,
            earnings: {
                today: todayEarnings,
                thisMonth: monthEarnings,
                total: lifetimeEarnings,
                walletBalance: astrologer.walletBalance || 0,
            },
            stats: {
                totalCalls,
                totalChats,
                pendingRequests: pendingCalls + pendingChats,
                averageRating: parseFloat(average),
                ratingCount: reviews.length,
                negativeReviewsCount: negativeReviews,
                dailyEarnings: todayEarnings,
                totalEarnings: lifetimeEarnings,
                walletBalance: astrologer.walletBalance || 0,
                blogCount,
                courseCount,
                activeSessions: activeSessionsCount,
                activeSessionsCount,
            },
            sessions,
            recentReviews: reviews.slice(0, 5),
            personalDetails: astrologer.personalDetails,
        };
        res.status(200).json({ success: true, ...data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getWalletSummary = async (req, res) => {
    try {
        const astrologer = await Astrologer.findOne({ userId: req.user._id });
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        // Find Transactions belonging to this astrologer (credits like earnings or debits like withdrawals)
        // Exclude the user's payment debit transactions
        const transactions = await Transaction.find({ 
            astrologerId: astrologer._id,
            $nor: [
                { type: 'debit', referenceType: { $in: ['ChatSession', 'CallSession'] } }
            ]
        })
            .sort({ createdAt: -1 })
            .limit(50);

        res.status(200).json({ 
            success: true, 
            balance: astrologer.walletBalance || 0,
            transactions: transactions.map(t => ({
                id: t._id,
                amount: t.amount,
                type: t.type === 'credit' ? 'Credit' : 'Debit', // Normalize for frontend
                description: t.description,
                date: t.createdAt,
                status: t.status
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAstrologers = async (req, res) => {
    try {
        const astrologers = await Astrologer.find({}).populate('userId', 'fullName email phoneNumber');
        res.status(200).json({ success: true, data: astrologers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getReviews = async (req, res) => {
    try {
        let astrologerId = req.params.astrologerId;
        
        if (!astrologerId && req.user) {
            const astrologer = await Astrologer.findOne({ userId: req.user._id || req.user.id });
            if (astrologer) astrologerId = astrologer._id;
        }
        
        if (!astrologerId) {
            return res.status(400).json({ success: false, message: 'Astrologer ID is required' });
        }

        const reviews = await Review.find({ astrologerId })
            .populate('userId', 'fullName profilePhoto')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: reviews });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const acceptCall = async (req, res) => {
    try {
        const { callId } = req.params;
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer profile not found' });
        }

        const targetCall = await CallSession.findById(callId);
        if (!targetCall) return res.status(404).json({ success: false, message: 'Call not found' });
        if (targetCall.astrologerId.toString() !== astrologer._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized for this call' });
        }

        // Clean up ghost sessions to prevent unique index dup key error
        await CallSession.updateMany(
            { 
                userId: targetCall.userId, 
                astrologerId: targetCall.astrologerId, 
                status: 'connecting',
                _id: { $ne: callId } 
            },
            { status: 'ended', endTime: new Date() }
        );
        await CallSession.updateMany(
            { 
                userId: targetCall.userId, 
                astrologerId: targetCall.astrologerId, 
                status: 'active',
                _id: { $ne: callId } 
            },
            { status: 'ended', endTime: new Date() }
        );

        const call = await CallSession.findByIdAndUpdate(callId, { status: 'connecting' }, { new: true });
        
        try {
            const cid = call._id.toString();
            const payload = { callId: cid, callType: call.callType || 'audio' };
            emitToUser(call.userId, 'call_accepted', payload);
            const io = getIO();
            io.to(`call_${cid}`).emit('call_accepted', payload);
            await io.in(`user_${call.userId}`).socketsJoin(`call_${cid}`);
            await io.in(`astrologer_${astrologer._id}`).socketsJoin(`call_${cid}`);
        } catch (err) {
            console.error('Socket emit error:', err);
        }

        // Set Busy status
        try {
            const astrologerBusy = await Astrologer.findById(call.astrologerId);
            if (astrologerBusy) {
                astrologerBusy.availability.status = 'busy';
                await astrologerBusy.save();
                getIO().emit('user_presence', { userId: astrologerBusy.userId, isOnline: true, status: 'busy' });
            }
        } catch (e) {
            console.error('Busy status error:', e);
        }

        res.status(200).json({ success: true, message: 'Call accepted', data: call });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const rejectCall = async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findByIdAndUpdate(callId, { status: 'rejected' }, { new: true });
        if (!call) return res.status(404).json({ success: false, message: 'Call not found' });
        
        try {
            emitToUser(call.userId, 'call_rejected', { callId: call._id.toString() });
        } catch (err) {
            console.error('Socket emit error:', err);
        }

        res.status(200).json({ success: true, message: 'Call rejected', data: call });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const acceptChat = async (req, res) => {
    try {
        const { sessionId } = req.params;
        console.log(`[Astrologer] Accepting chat session: ${sessionId}`);

        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer profile not found' });
        }
        
        // Find the target session first to get userId and astrologerId
        const targetSession = await ChatSession.findById(sessionId);
        if (!targetSession) {
            console.error(`[Astrologer] Chat session not found: ${sessionId}`);
            return res.status(404).json({ success: false, message: 'Chat session not found' });
        }
        if (targetSession.astrologerId.toString() !== astrologer._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized for this chat' });
        }

        // Clean up any existing "active" sessions between this user and astrologer
        // to prevent MongoDB E11000 duplicate key error on the unique index.
        await ChatSession.updateMany(
            { 
                userId: targetSession.userId, 
                astrologerId: targetSession.astrologerId, 
                status: 'active',
                _id: { $ne: sessionId } 
            },
            { status: 'ended', endTime: new Date() }
        );

        // Now safe to update the new session to active
        const session = await ChatSession.findByIdAndUpdate(
            sessionId,
            { status: 'active', startTime: targetSession.startTime || new Date() },
            { new: true }
        );
        
        try {
            const sid = session._id.toString();
            console.log(`[Astrologer] Emitting chat_accepted sessionId=${sid}`);
            emitToUser(session.userId, 'chat_accepted', { sessionId: sid });
            const io = getIO();
            io.to(`chat_${sid}`).emit('chat_accepted', { sessionId: sid });
            await io.in(`user_${session.userId}`).socketsJoin(`chat_${sid}`);
            await io.in(`astrologer_${astrologer._id}`).socketsJoin(`chat_${sid}`);
        } catch (err) {
            console.error('Socket emit error:', err);
        }

        // Set Busy status
        try {
            const astrologerBusy = await Astrologer.findById(session.astrologerId);
            if (astrologerBusy) {
                astrologerBusy.availability.status = 'busy';
                await astrologerBusy.save();
                getIO().emit('user_presence', { userId: astrologerBusy.userId, isOnline: true, status: 'busy' });
            }
        } catch (e) {
            console.error('Busy status error:', e);
        }

        res.status(200).json({ success: true, message: 'Chat accepted', data: session });
    } catch (error) {
        console.error(`[Astrologer] acceptChat error:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const rejectChat = async (req, res) => {
    try {
        const { sessionId } = req.params;
        console.log(`[Astrologer] Rejecting chat session: ${sessionId}`);
        const session = await ChatSession.findByIdAndUpdate(sessionId, { status: 'cancelled' }, { new: true });
        if (!session) {
            console.error(`[Astrologer] Chat session not found for rejection: ${sessionId}`);
            return res.status(404).json({ success: false, message: 'Chat session not found' });
        }
        
        try {
            emitToUser(session.userId, 'chat_rejected', { sessionId: session._id.toString() });
        } catch (err) {
            console.error('Socket emit error:', err);
        }

        res.status(200).json({ success: true, message: 'Chat rejected', data: session });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


export const getMyClients = async (req, res) => {
    try {
        const astrologer = await Astrologer.findOne({ userId: req.user._id });
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer profile not found' });
        }

        // Get unique user IDs from all session types
        const callUsers = await CallSession.distinct('userId', { astrologerId: astrologer._id });
        const chatUsers = await ChatSession.distinct('userId', { astrologerId: astrologer._id });
        
        // Also include followers as clients
        const followers = await User.find({ followedAstrologers: astrologer._id }).distinct('_id');
        
        // Combine all sources and ensure uniqueness using strings
        const allClientIds = [
            ...callUsers.map(id => id.toString()),
            ...chatUsers.map(id => id.toString()),
            ...followers.map(id => id.toString())
        ];
        
        const uniqueUserIds = [...new Set(allClientIds)];

        // Fetch user details
        const clients = await User.find({ 
            _id: { $in: uniqueUserIds } 
        }).select('fullName email phoneNumber profilePhoto isOnline').lean();

        // Add lastChatSessionId to each client to support direct chat from the list
        for (let client of clients) {
            const lastSession = await ChatSession.findOne({
                userId: client._id,
                astrologerId: astrologer._id
            }).sort({ createdAt: -1 });
            
            if (lastSession) {
                client.lastChatSessionId = lastSession._id;
            }
        }

        res.status(200).json({ success: true, data: clients });
    } catch (error) {
        console.error('getMyClients error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getWaitlist = async (req, res) => {
    try {
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer profile not found' });
        }

        // Only show sessions from the last 1 hour to avoid "false" stale data
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        const pendingCalls = await CallSession.find({ 
            astrologerId: astrologer._id, 
            status: 'ringing',
            createdAt: { $gt: oneHourAgo }
        }).populate('userId', 'fullName profilePhoto');

        const pendingChats = await ChatSession.find({ 
            astrologerId: astrologer._id, 
            status: 'pending',
            createdAt: { $gt: oneHourAgo }
        }).populate('userId', 'fullName profilePhoto');

        const waitlist = [
            ...pendingCalls.map(c => {
                const obj = c.toObject();
                return { ...obj, id: obj._id.toString(), sessionType: 'Call' };
            }),
            ...pendingChats.map(c => {
                const obj = c.toObject();
                return { ...obj, id: obj._id.toString(), sessionType: 'Chat' };
            })
        ];


        // Sort by creation time
        waitlist.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.status(200).json({ success: true, data: waitlist });
    } catch (error) {
        console.error('getWaitlist error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getChatMessages = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await ChatSession.findById(sessionId)
            .populate('userId', 'fullName profilePhoto isOnline');
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Chat session not found' });
        }

        res.status(200).json({ 
            success: true, 
            data: { 
                messages: session.messages,
                session: {
                    _id: session._id,
                    status: session.status,
                    startTime: session.startTime,
                    userId: session.userId,
                },
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getChatSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await ChatSession.findById(sessionId).populate('userId', 'fullName profilePhoto isOnline');
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Chat session not found' });
        }

        res.status(200).json({ 
            success: true, 
            data: session
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const endChat = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await ChatSession.findById(sessionId);

        if (!session) return res.status(404).json({ success: false, message: 'Chat session not found' });
        if (session.status === 'ended') return res.status(400).json({ success: false, message: 'Chat already ended' });

        const endTime = new Date();
        const startTime = session.startTime || session.createdAt;
        const durationInSeconds = Math.floor((endTime - startTime) / 1000);
        const durationInMinutes = Math.ceil(durationInSeconds / 60);

        const billableMinutes = Math.max(0, durationInMinutes - 5);
        
        const astrologer = await Astrologer.findById(session.astrologerId);
        const pricing = astrologer?.pricing || { chat: 0 };
        const totalCost = billableMinutes * (pricing.chat || 0);

        if (totalCost > 0) {
            await User.findByIdAndUpdate(session.userId, {
                $inc: { walletBalance: -totalCost }
            }, { runValidators: false });

            const user = await User.findById(session.userId);

            if (astrologer) {
                await Astrologer.findByIdAndUpdate(astrologer._id, {
                    $inc: { walletBalance: totalCost }
                }, { runValidators: false });
            }

            await Transaction.create({
                userId: session.userId,
                astrologerId: session.astrologerId,
                amount: totalCost,
                type: 'debit',
                description: `Chat with ${astrologer?.personalDetails?.name || 'Astrologer'} (${durationInMinutes} mins, 5 mins free)`,
                referenceId: session._id,
                referenceType: 'ChatSession'
            });

            await Transaction.create({
                astrologerId: session.astrologerId,
                userId: session.userId,
                amount: totalCost,
                type: 'credit',
                description: `Earnings from chat with ${user?.fullName || 'User'} (${durationInMinutes} mins, 5 mins free)`,
                referenceId: session._id,
                referenceType: 'ChatSession'
            });
        }

        session.status = 'ended';
        session.endTime = endTime;
        session.duration = durationInSeconds;
        session.cost = totalCost;
        await session.save();
        
        if (astrologer) {
            await Astrologer.findByIdAndUpdate(astrologer._id, {
                'availability.status': 'online'
            }, { runValidators: false });
            getIO().emit('user_presence', { userId: astrologer.userId, isOnline: true, status: 'online' });
        }
        
        try {
            getIO().to(`user_${session.userId}`).emit('chat_ended', { sessionId: session._id });
        } catch (e) {}

        res.status(200).json({ success: true, message: 'Chat ended', data: session });
    } catch (error) {
        console.error('[astrologer endChat] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const endCall = async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findById(callId);
        
        if (!call) return res.status(404).json({ success: false, message: 'Call not found' });
        if (call.status === 'ended') return res.status(400).json({ success: false, message: 'Call already ended' });

        const endTime = new Date();
        const startTime = call.startTime || call.createdAt;
        const durationInSeconds = Math.floor((endTime - startTime) / 1000);
        const durationInMinutes = Math.ceil(durationInSeconds / 60);

        const astrologer = await Astrologer.findById(call.astrologerId);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        const pricing = astrologer.pricing || { call: 0, video: 0 };
        const perMinRate = call.callType === 'video' ? (pricing.video || 0) : (pricing.call || 0);
        const totalCost = durationInMinutes * perMinRate;

        // Deduct from user wallet
        const user = await User.findById(call.userId);
        if (user) {
            user.walletBalance -= totalCost;
            await user.save();
        }

        // Add to astrologer wallet
        astrologer.walletBalance = (astrologer.walletBalance || 0) + totalCost;
        await astrologer.save();

        // Create transactions
        await Transaction.create({
            userId: call.userId,
            astrologerId: astrologer._id,
            amount: totalCost,
            type: 'debit',
            description: `Call with ${astrologer.personalDetails.name} (${durationInMinutes} mins)`,
            referenceId: call._id,
            referenceType: 'CallSession'
        });

        await Transaction.create({
            astrologerId: astrologer._id,
            userId: call.userId,
            amount: totalCost,
            type: 'credit',
            description: `Earnings from call with ${user?.fullName || 'User'} (${durationInMinutes} mins)`,
            referenceId: call._id,
            referenceType: 'CallSession'
        });

        call.status = 'ended';
        call.endTime = endTime;
        call.duration = durationInSeconds;
        call.cost = totalCost;
        await call.save();

        // Set Astrologer back to Online
        astrologer.availability.status = 'online';
        await astrologer.save();
        
        try {
            getIO().emit('user_presence', { userId: astrologer.userId, isOnline: true, status: 'online' });
            getIO().to(`user_${call.userId}`).emit('call_ended', { callId: call._id });
        } catch (e) {}

        res.status(200).json({ success: true, message: 'Call ended', data: call });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getCallEarnings = async (req, res) => {
    try {
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        const completedCalls = await CallSession.find({ 
            astrologerId: astrologer._id, 
            status: { $in: COMPLETED_SESSION_STATUSES },
        })
        .populate('userId', 'fullName')
        .sort({ createdAt: -1 });

        const completedChats = await ChatSession.find({
            astrologerId: astrologer._id,
            status: { $in: COMPLETED_SESSION_STATUSES },
        }).populate('userId', 'fullName').sort({ createdAt: -1 });

        const callEarnings = completedCalls.reduce((acc, call) => acc + (call.cost || 0), 0);
        const chatEarnings = completedChats.reduce((acc, chat) => acc + (chat.cost || 0), 0);
        const totalEarnings = callEarnings + chatEarnings;
        const totalConsultations = completedCalls.length + completedChats.length;
        const averageSessionValue = totalConsultations > 0
            ? totalEarnings / totalConsultations
            : 0;

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const breakdown = [];
        let topDay = 'N/A';
        let topDayAmount = 0;
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            const next = new Date(d);
            next.setDate(next.getDate() + 1);
            const dayEarnings =
                completedCalls
                    .filter((c) => c.createdAt >= d && c.createdAt < next)
                    .reduce((sum, c) => sum + (c.cost || 0), 0) +
                completedChats
                    .filter((c) => c.createdAt >= d && c.createdAt < next)
                    .reduce((sum, c) => sum + (c.cost || 0), 0);
            const label = dayNames[d.getDay()];
            breakdown.push({ day: label, earnings: dayEarnings });
            if (dayEarnings > topDayAmount) {
                topDayAmount = dayEarnings;
                topDay = label;
            }
        }

        res.status(200).json({
            success: true,
            data: {
                totalEarnings,
                callCount: completedCalls.length,
                chatCount: completedChats.length,
                summary: {
                    totalSessions: totalConsultations,
                    totalConsultations,
                    callSessions: completedCalls.length,
                    chatSessions: completedChats.length,
                    averageSessionValue,
                },
                topDay,
                breakdown,
                calls: completedCalls.map(c => ({
                    id: c._id,
                    userName: c.userId?.fullName || 'User',
                    duration: c.duration || 0,
                    earnings: c.cost || 0,
                    date: c.createdAt
                }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAnalytics = async (req, res) => {
    try {
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        const calls = await CallSession.find({
            astrologerId: astrologer._id,
            status: { $in: COMPLETED_SESSION_STATUSES },
        }).populate('userId', 'gender');
        const chats = await ChatSession.find({
            astrologerId: astrologer._id,
            status: { $in: COMPLETED_SESSION_STATUSES },
        }).populate('userId', 'gender');
        const sessions = [...calls, ...chats];

        const totalEarnings = sessions.reduce((acc, s) => acc + (s.cost || 0), 0);
        const totalSessions = sessions.length;
        const averageValue = totalSessions > 0 ? (totalEarnings / totalSessions).toFixed(2) : 0;
        const totalDurationSeconds = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
        const totalDurationHours = (totalDurationSeconds / 3600).toFixed(1);

        // Earnings Trends (last 6 months)
        const trendsMap = {};
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
            trendsMap[key] = 0;
        }

        sessions.forEach(s => {
            const date = new Date(s.createdAt);
            const key = `${months[date.getMonth()]} ${date.getFullYear()}`;
            if (trendsMap.hasOwnProperty(key)) {
                trendsMap[key] += (s.cost || 0);
            }
        });

        // Demographics (Age groups)
        const demographicsMap = { '18-24': 0, '25-34': 0, '35-44': 0, '45+': 0 };
        const nowYear = new Date().getFullYear();
        
        const clientIds = [...new Set(sessions.map(s => s.userId?._id?.toString()))].filter(id => id);
        const clients = await User.find({ _id: { $in: clientIds } });

        clients.forEach(c => {
            if (c.dob) {
                const age = nowYear - new Date(c.dob).getFullYear();
                if (age >= 18 && age <= 24) demographicsMap['18-24']++;
                else if (age >= 25 && age <= 34) demographicsMap['25-34']++;
                else if (age >= 35 && age <= 44) demographicsMap['35-44']++;
                else if (age >= 45) demographicsMap['45+']++;
            } else {
                demographicsMap['25-34']++;
            }
        });

        res.status(200).json({
            success: true,
            data: {
                totalEarnings,
                totalSessions,
                averageValue,
                totalDurationHours,
                totalClients: clients.length,
                earningsTrends: Object.entries(trendsMap).map(([name, value]) => ({ name, value })),
                demographics: Object.entries(demographicsMap).map(([name, value]) => ({ name, value })),
                sessionTypeBreakdown: {
                    chat: chats.length,
                    call: calls.length
                }
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getInternalNotes = async (req, res) => {
    try {
        const astrologer = await Astrologer.findOne({ userId: req.user._id });
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        const notes = await Note.find({ astrologerId: astrologer._id }).sort({ createdAt: -1 });
        res.status(200).json(notes); // Frontend expects an array directly based on ApiService
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const saveInternalNote = async (req, res) => {
    try {
        const { title, content } = req.body;
        const astrologer = await Astrologer.findOne({ userId: req.user._id });
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        const note = await Note.create({
            astrologerId: astrologer._id,
            title,
            content
        });

        res.status(201).json(note);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const confirmCallConnection = async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findByIdAndUpdate(callId, { 
            status: 'active', 
            startTime: new Date() 
        }, { new: true });

        if (!call) return res.status(404).json({ success: false, message: 'Call not found' });

        // Set Astrologer to Busy
        await Astrologer.findByIdAndUpdate(call.astrologerId, { 
            'availability.status': 'busy' 
        });
        
        try {
            const astro = await Astrologer.findById(call.astrologerId);
            if (astro) {
                getIO().emit('user_presence', { userId: astro.userId, isOnline: true, status: 'busy' });
            }
        } catch (e) {}

        res.status(200).json({ success: true, message: 'Call connected', data: call });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        await User.findByIdAndUpdate(req.user._id, { fcmToken });
        res.status(200).json({ success: true, message: 'FCM Token updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({
            $or: [
                { userId: req.user._id },
                { user_id: req.user._id },
                { targetId: req.user._id.toString() },
                { target: 'all' },
                { target: 'astrologers' }
            ]
        }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const markNotificationRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        await Notification.findByIdAndUpdate(notificationId, { isRead: true });
        res.status(200).json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


export const uploadInterviewDocument = async (req, res) => {
    try {
        const astrologer = await Astrologer.findOne({ userId: req.user._id });
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

        // Add to Astrologer profile
        astrologer.documents.interviewDocuments.push(fileUrl);
        await astrologer.save();

        // Also add to Interview current phase if it exists
        const Interview = (await import('../modules/admin/models/InterviewModel.js')).default;
        const interview = await Interview.findOne({ astrologer_id: astrologer._id });
        if (interview) {
            const phase = `phase${interview.current_phase}`;
            if (interview[phase]) {
                if (!interview[phase].documents) interview[phase].documents = [];
                interview[phase].documents.push(fileUrl);
                await interview.save();
            }
        }

        res.status(200).json({ success: true, message: 'Document uploaded successfully', fileUrl });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateBankDetails = async (req, res) => {
    try {
        const astrologer = await Astrologer.findOne({ userId: req.user._id });
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        const { bankName, accountNumber, ifscCode, accountHolderName, upiId } = req.body;
        
        astrologer.bankDetails = {
            bankName: bankName || astrologer.bankDetails?.bankName,
            accountNumber: accountNumber || astrologer.bankDetails?.accountNumber,
            ifscCode: ifscCode || astrologer.bankDetails?.ifscCode,
            accountHolderName: accountHolderName || astrologer.bankDetails?.accountHolderName,
            upiId: upiId || astrologer.bankDetails?.upiId
        };

        await astrologer.save();
        res.status(200).json({ success: true, message: 'Bank details updated', data: astrologer.bankDetails });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const requestWithdrawal = async (req, res) => {
    try {
        const { amount, description } = req.body;
        const astrologer = await Astrologer.findOne({ userId: req.user._id });
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        if (astrologer.walletBalance < amount) {
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }

        // Deduct immediately to "lock" funds
        astrologer.walletBalance -= amount;
        await astrologer.save();

        const transaction = await Transaction.create({
            astrologerId: astrologer._id,
            amount,
            type: 'debit',
            status: 'pending',
            description: description || 'Withdrawal request',
            referenceType: 'Withdrawal'
        });

        res.status(201).json({ success: true, message: 'Withdrawal request submitted', data: transaction });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getTrainingModules = async (req, res) => {
    try {
        const raw = await TrainingModule.find({ isPublished: true })
            .sort({ sortOrder: 1, createdAt: -1 })
            .lean();

        const modules = raw.map((m) => {
            const obj = { ...m };
            if (obj.thumbnail) obj.thumbnail = normalizeMediaPath(obj.thumbnail);
            if (obj.videoUrl) obj.videoUrl = normalizeMediaPath(obj.videoUrl);
            obj.resources = (obj.resources || []).map((r) => ({
                ...r,
                url: normalizeMediaPath(r.url),
            }));
            obj.certifications = (obj.certifications || []).map((c) => ({
                ...c,
                url: normalizeMediaPath(c.url),
                imageUrl: normalizeMediaPath(c.imageUrl),
            }));
            return obj;
        });

        const certifications = modules.flatMap((m) =>
            (m.certifications || []).map((c) => ({
                title: c.title,
                description: c.description,
                url: c.url,
                imageUrl: c.imageUrl,
                moduleId: m._id,
                moduleTitle: m.title,
            }))
        );

        res.status(200).json({
            success: true,
            data: {
                modules,
                certifications,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateTrainingProgress = async (req, res) => {
    try {
        const { moduleId, watchTime } = req.body;
        res.status(200).json({
            success: true,
            message: 'Training progress updated successfully',
            data: { moduleId, watchTime }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const registerMasterclass = async (req, res) => {
    try {
        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        if (!astrologer.trainingEnrollment) astrologer.trainingEnrollment = {};
        astrologer.trainingEnrollment.masterclassRegistered = true;
        astrologer.trainingEnrollment.masterclassRegisteredAt = new Date();
        astrologer.markModified('trainingEnrollment');
        await astrologer.save();

        res.status(200).json({
            success: true,
            message: 'Successfully registered for the upcoming masterclass',
            data: astrologer.trainingEnrollment,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const submitTrainingAssignment = async (req, res) => {
    try {
        const { moduleId, notes } = req.body;
        if (!moduleId) {
            return res.status(400).json({ success: false, message: 'moduleId is required' });
        }

        const astrologer = await resolveAstrologerForUser(req.user);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;
        if (!astrologer.trainingEnrollment) astrologer.trainingEnrollment = {};
        if (!astrologer.trainingEnrollment.assignmentSubmissions) {
            astrologer.trainingEnrollment.assignmentSubmissions = [];
        }

        astrologer.trainingEnrollment.assignmentSubmissions.push({
            moduleId,
            notes: notes || '',
            fileUrl: normalizeMediaPath(fileUrl),
            submittedAt: new Date(),
        });
        astrologer.markModified('trainingEnrollment');
        await astrologer.save();

        res.status(200).json({
            success: true,
            message: 'Assignment submitted successfully',
            data: astrologer.trainingEnrollment.assignmentSubmissions,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
