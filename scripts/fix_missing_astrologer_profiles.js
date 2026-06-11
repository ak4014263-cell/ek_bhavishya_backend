import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Astrologer from '../src/models/Astrologer.js';
import dotenv from 'dotenv';
import { resolveAstrologerForUser } from '../src/utils/astrologerLink.js';

dotenv.config();
import connectDB from '../src/config/db.js';

const fixMissingProfiles = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB\n');

        console.log('=== FIXING MISSING ASTROLOGER PROFILES ===\n');

        // Find all astrologers without profiles
        const astrologerUsers = await User.find({ role: 'astrologer' });
        
        const withoutProfiles = [];
        
        for (const user of astrologerUsers) {
            const profile = await Astrologer.findOne({ userId: user._id });
            if (!profile) {
                withoutProfiles.push(user);
            }
        }

        console.log(`Found ${withoutProfiles.length} astrologers without profiles\n`);
        console.log('Creating profiles...\n');

        let success = 0;
        let failed = 0;

        for (const user of withoutProfiles) {
            try {
                const profile = await resolveAstrologerForUser(user);
                
                if (profile) {
                    console.log(`✓ ${user.email || user.phoneNumber}`);
                    success++;
                } else {
                    console.log(`✗ ${user.email || user.phoneNumber} - Could not create profile`);
                    failed++;
                }
            } catch (err) {
                console.log(`✗ ${user.email || user.phoneNumber} - Error: ${err.message}`);
                failed++;
            }
        }

        console.log('\n=== SUMMARY ===');
        console.log(`Total fixed: ${success}`);
        console.log(`Total failed: ${failed}`);
        console.log(`Total processed: ${success + failed}`);

        if (success > 0) {
            console.log('\n✓ All missing profiles have been created!');
            console.log('Users can now login.');
        }

        process.exit(failed > 0 ? 1 : 0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

fixMissingProfiles();