import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';
import User from './src/models/User.js';
import Astrologer from './src/models/Astrologer.js';

dotenv.config();

const createUser = async () => {
    try {
        if (process.env.MONGO_DNS_SERVERS) {
            const servers = process.env.MONGO_DNS_SERVERS.split(',');
            dns.setServers(servers);
            console.log(`[DB] Using custom DNS servers: ${servers.join(', ')}`);
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const email = 'ak4014263@gmail.com';
        const password = 'password123';
        
        let user = await User.findOne({ email });
        if (user) {
            console.log('User already exists. Updating to astrologer.');
            user.role = 'astrologer';
            user.password = password;
            await user.save();
        } else {
            console.log('Creating new user...');
            user = await User.create({
                fullName: 'AK Astrologer',
                email,
                password,
                role: 'astrologer'
            });
        }

        let astrologer = await Astrologer.findOne({ userId: user._id });
        if (!astrologer) {
            console.log('Creating astrologer profile...');
            astrologer = await Astrologer.create({
                userId: user._id,
                personalDetails: {
                    name: 'AK Astrologer',
                    email: email,
                    phone: '1234567890'
                },
                systemStatus: {
                    isApproved: true,
                    isVerified: true
                }
            });
        }

        console.log('Done! User created/updated successfully.');
        console.log('Email:', email);
        console.log('Password:', password);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

createUser();
