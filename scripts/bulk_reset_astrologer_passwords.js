import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Astrologer from '../src/models/Astrologer.js';
import dotenv from 'dotenv';
import { resolveAstrologerForUser } from '../src/utils/astrologerLink.js';

dotenv.config();
import connectDB from '../src/config/db.js';

const bulkResetAstrologerPasswords = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB\n');

        // Default password - should be changed by users
        const DEFAULT_PASSWORD = 'Astro@2024';
        
        // Find all astrologers without passwords
        const astrologersWithoutPassword = await User.find({ 
            role: 'astrologer',
            $or: [
                { password: { $exists: false } },
                { password: null },
                { password: '' }
            ]
        });

        console.log(`Found ${astrologersWithoutPassword.length} astrologers without passwords\n`);
        
        if (astrologersWithoutPassword.length === 0) {
            console.log('No astrologers need password reset!');
            process.exit(0);
        }

        console.log('Resetting passwords...\n');
        
        const results = [];
        
        for (const user of astrologersWithoutPassword) {
            try {
                // Set password
                user.password = DEFAULT_PASSWORD;
                user.status = 'Active';
                await user.save();
                
                // Ensure astrologer profile exists
                const astrologer = await resolveAstrologerForUser(user);
                
                results.push({
                    email: user.email || user.phoneNumber,
                    success: true,
                    profileLinked: !!astrologer
                });
                
                console.log(`✓ Reset password for: ${user.email || user.phoneNumber}`);
            } catch (err) {
                results.push({
                    email: user.email || user.phoneNumber,
                    success: false,
                    error: err.message
                });
                console.log(`✗ Failed for: ${user.email || user.phoneNumber} - ${err.message}`);
            }
        }

        console.log('\n=== SUMMARY ===');
        console.log(`Total processed: ${results.length}`);
        console.log(`Successful: ${results.filter(r => r.success).length}`);
        console.log(`Failed: ${results.filter(r => !r.success).length}`);
        
        console.log('\n=== LOGIN CREDENTIALS ===');
        console.log(`Default Password: ${DEFAULT_PASSWORD}`);
        console.log('(Users should change this password after first login)\n');
        
        console.log('Affected users:');
        results.filter(r => r.success).forEach(r => {
            console.log(`- ${r.email}`);
        });

        if (results.some(r => !r.success)) {
            console.log('\nFailed users:');
            results.filter(r => !r.success).forEach(r => {
                console.log(`- ${r.email}: ${r.error}`);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

bulkResetAstrologerPasswords();