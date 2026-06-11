import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/User.js';

import dns from 'dns';

dotenv.config();

const checkUser = async () => {
    try {
        if (process.env.MONGO_DNS_SERVERS) {
            const servers = process.env.MONGO_DNS_SERVERS.split(',');
            dns.setServers(servers);
            console.log(`[DB] Using custom DNS servers: ${servers.join(', ')}`);
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const email = 'ak4014263@gmail.com';
        const user = await User.findOne({ email });

        if (user) {
            console.log('User found:', user);
        } else {
            console.log('User NOT found');
            const partialMatches = await User.find({ email: { $regex: '^ak', $options: 'i' } }, 'email role');
            console.log('Users starting with "ak":', partialMatches);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkUser();
