import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from './src/models/User.js';
import Astrologer from './src/models/Astrologer.js';
import connectDB from './src/config/db.js';
import dotenv from 'dotenv';

dotenv.config();

const email = 'ak4014263@gmail.com';
const password = 'test123';

const run = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB');

        let user = await User.findOne({ email });
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        if (!user) {
            console.log('User not found, creating...');
            user = await User.create({
                email,
                password: hashedPassword,
                fullName: 'Ajay Kumar',
                role: 'astrologer',
                is_verified: true
            });
        } else {
            console.log('User found, updating...');
            user.password = hashedPassword;
            user.role = 'astrologer';
            await user.save();
        }

        let astrologer = await Astrologer.findOne({ userId: user._id });
        if (!astrologer) {
            console.log('Astrologer record not found, creating...');
            astrologer = await Astrologer.create({
                userId: user._id,
                personalDetails: {
                    name: user.fullName,
                    email: user.email,
                    phone: '1234567890',
                    gender: 'Male',
                    about: 'Expert astrologer with years of experience.'
                },
                pricing: {
                    chat: 5,
                    call: 5,
                    video: 10
                },
                isOnline: true,
                status: 'approved'
            });
        } else {
            console.log('Astrologer record found, updating status...');
            astrologer.status = 'approved';
            await astrologer.save();
        }

        console.log('Test astrologer setup complete!');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

run();
