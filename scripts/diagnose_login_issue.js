import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Astrologer from '../src/models/Astrologer.js';
import Seller from '../src/models/Seller.js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

import connectDB from '../src/config/db.js';

const diagnoseLoginIssue = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB\n');

        // Check astrologers
        console.log('=== ASTROLOGER ACCOUNTS ===');
        const astrologerUsers = await User.find({ role: 'astrologer' }).limit(10);
        console.log(`Found ${astrologerUsers.length} astrologer users:\n`);
        
        for (const user of astrologerUsers) {
            const profile = await Astrologer.findOne({ userId: user._id });
            console.log(`Email: ${user.email || 'N/A'}`);
            console.log(`Phone: ${user.phoneNumber || 'N/A'}`);
            console.log(`Has Password Hash: ${!!user.password}`);
            console.log(`Status: ${user.status || 'N/A'}`);
            console.log(`Profile Exists: ${!!profile}`);
            if (profile) {
                console.log(`Profile Approved: ${profile.systemStatus?.isApproved || profile.isApproved || false}`);
            }
            console.log('---');
        }

        // Check sellers
        console.log('\n=== SELLER ACCOUNTS ===');
        const sellerUsers = await User.find({ role: 'seller' }).limit(10);
        console.log(`Found ${sellerUsers.length} seller users:\n`);
        
        for (const user of sellerUsers) {
            const profile = await Seller.findOne({ userId: user._id });
            console.log(`Email: ${user.email || 'N/A'}`);
            console.log(`Phone: ${user.phoneNumber || 'N/A'}`);
            console.log(`Has Password Hash: ${!!user.password}`);
            console.log(`Status: ${user.status || 'N/A'}`);
            console.log(`Profile Exists: ${!!profile}`);
            if (profile) {
                console.log(`Profile Approved: ${profile.is_approved || false}`);
                console.log(`Store Name: ${profile.storeName || 'N/A'}`);
            }
            console.log('---');
        }

        // Check for users without password hashes
        console.log('\n=== USERS WITHOUT PASSWORDS ===');
        const usersWithoutPassword = await User.find({ 
            role: { $in: ['astrologer', 'seller'] },
            $or: [
                { password: { $exists: false } },
                { password: null },
                { password: '' }
            ]
        });
        console.log(`Found ${usersWithoutPassword.length} users without password hashes`);
        
        if (usersWithoutPassword.length > 0) {
            console.log('\nThese users need password reset:');
            for (const user of usersWithoutPassword) {
                console.log(`- ${user.email || user.phoneNumber} (${user.role})`);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

diagnoseLoginIssue();