import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Astrologer from '../src/models/Astrologer.js';
import Seller from '../src/models/Seller.js';
import dotenv from 'dotenv';
import { resolveAstrologerForUser } from '../src/utils/astrologerLink.js';
import { getOrCreateSeller } from '../src/modules/seller/utils/seller.utils.js';

dotenv.config();
import connectDB from '../src/config/db.js';

const emailRegex = (email) => {
    const escaped = String(email).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`, 'i');
};

const resetUserPassword = async () => {
    try {
        const args = process.argv.slice(2);
        if (args.length < 2) {
            console.log('Usage: node reset_user_password.js <email/phone> <new_password> [role]');
            console.log('Example: node reset_user_password.js astrologer@gmail.com newPassword123 astrologer');
            console.log('Example: node reset_user_password.js seller@example.com newPassword123 seller');
            console.log('If role is not specified, it will keep the existing role');
            process.exit(1);
        }

        const identifier = args[0];
        const newPassword = args[1];
        const forceRole = args[2]; // optional

        await connectDB();
        console.log('Connected to MongoDB\n');

        // Find user by email or phone
        let user;
        if (identifier.includes('@')) {
            user = await User.findOne({ email: emailRegex(identifier) });
            if (!user) {
                // Check in astrologer profiles
                const astro = await Astrologer.findOne({ 'personalDetails.email': emailRegex(identifier) });
                if (astro?.userId) {
                    user = await User.findById(astro.userId);
                }
            }
            if (!user) {
                // Check in seller profiles
                const seller = await Seller.findOne({ email: emailRegex(identifier) });
                if (seller?.userId) {
                    user = await User.findById(seller.userId);
                }
            }
        } else {
            // Phone number search
            user = await User.findOne({ phoneNumber: identifier });
        }

        if (!user) {
            console.error(`No user found for: ${identifier}`);
            process.exit(1);
        }

        console.log(`Found user: ${user.email || user.phoneNumber}`);
        console.log(`Current role: ${user.role}`);
        console.log(`Current status: ${user.status}`);

        // Update role if specified
        if (forceRole && ['astrologer', 'seller', 'user'].includes(forceRole)) {
            user.role = forceRole;
            console.log(`Updating role to: ${forceRole}`);
        }

        // Set new password (will be hashed by pre-save hook)
        user.password = newPassword;
        
        // Ensure active status
        user.status = 'Active';
        
        await user.save();
        console.log('\n✓ Password updated successfully!');

        // Ensure profile exists based on role
        if (user.role === 'astrologer') {
            const astrologer = await resolveAstrologerForUser(user);
            if (astrologer) {
                console.log(`✓ Astrologer profile linked: ${astrologer._id}`);
                console.log(`  Approved: ${astrologer.systemStatus?.isApproved || astrologer.isApproved || false}`);
            } else {
                console.log('⚠ Warning: Could not create/link astrologer profile');
            }
        } else if (user.role === 'seller') {
            try {
                const seller = await getOrCreateSeller(user);
                if (seller) {
                    console.log(`✓ Seller profile linked: ${seller._id}`);
                    console.log(`  Store: ${seller.storeName || 'N/A'}`);
                    console.log(`  Approved: ${seller.is_approved || false}`);
                } else {
                    console.log('⚠ Warning: Could not create/link seller profile');
                }
            } catch (err) {
                console.log('⚠ Warning: Error linking seller profile:', err.message);
            }
        }

        console.log('\n--- Login Credentials ---');
        console.log(`Email/Phone: ${user.email || user.phoneNumber}`);
        console.log(`Password: ${newPassword}`);
        console.log(`Role: ${user.role}`);
        console.log('-------------------------\n');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

resetUserPassword();