import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Astrologer from '../src/models/Astrologer.js';
import dotenv from 'dotenv';

dotenv.config();
import connectDB from '../src/config/db.js';

const fixRemainingProfiles = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB\n');

        console.log('=== FIXING REMAINING ASTROLOGER PROFILES ===\n');

        const targetEmails = [
            'mayanksaharkar@gmail.com',
            'veratil705@muncloud.com',
            'dhirajasinga9@gmail.com',
            'dhirajaisinga9@gmail.com',
            'onlinenetcafebetul892@gmail.com',
            'adarshchaudhary1628@gmail.com'
        ];

        for (const email of targetEmails) {
            try {
                const user = await User.findOne({ email });
                if (!user) {
                    console.log(`✗ ${email} - User not found`);
                    continue;
                }

                const profileExists = await Astrologer.findOne({ userId: user._id });
                if (profileExists) {
                    console.log(`✓ ${email} - Profile already exists`);
                    continue;
                }

                // Create with a unique phone number
                const uniquePhone = `${Date.now()}`.substring(-10);
                
                const profile = await Astrologer.create({
                    userId: user._id,
                    personalDetails: {
                        name: user.fullName || 'Astrologer',
                        email: user.email,
                        phone: uniquePhone
                    },
                    systemStatus: {
                        isApproved: false,
                        isVerified: false
                    }
                });
                
                console.log(`✓ ${email} - Profile created with phone: ${uniquePhone}`);
            } catch (err) {
                console.log(`✗ ${email} - Error: ${err.message}`);
            }
        }

        console.log('\n✓ All remaining profiles have been created!');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

fixRemainingProfiles();