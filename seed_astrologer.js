import mongoose from 'mongoose';
import User from './src/models/User.js';
import Astrologer from './src/models/Astrologer.js';
import dotenv from 'dotenv';

dotenv.config();

import connectDB from './src/config/db.js';

const seedAstrologer = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB');

        const email = 'astrologer@test.com';
        const password = 'password123';

        // Check if user exists
        let user = await User.findOne({ email });
        if (user) {
            console.log('User already exists, updating role to astrologer...');
            user.role = 'astrologer';
            user.password = password; // Will be hashed by pre-save hook
            await user.save();
        } else {
            user = await User.create({
                fullName: 'Test Astrologer',
                email,
                password,
                phoneNumber: '1234567890',
                role: 'astrologer'
            });
            console.log('User created');
        }

        // Check if astrologer profile exists
        let astrologer = await Astrologer.findOne({ userId: user._id });
        if (!astrologer) {
            astrologer = await Astrologer.create({
                userId: user._id,
                personalDetails: {
                    name: 'Test Astrologer',
                    email,
                    phone: '1234567890',
                    gender: 'Male',
                    experience: 5,
                    languages: ['English', 'Hindi'],
                    skills: ['Vedic', 'Numerology'],
                    categories: ['Career', 'Marriage']
                },
                pricing: {
                    chat: 10,
                    call: 15,
                    video: 25
                },
                systemStatus: {
                    isApproved: true,
                    isVerified: true
                }
            });
            console.log('Astrologer profile created');
        } else {
            astrologer.systemStatus.isApproved = true;
            astrologer.systemStatus.isVerified = true;
            await astrologer.save();
            console.log('Astrologer profile updated');
        }

        console.log('Seeding complete!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding:', error);
        process.exit(1);
    }
};

seedAstrologer();
