import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';
import User from '../src/models/User.js';

dotenv.config();

if (process.env.MONGO_DNS_SERVERS) {
    dns.setServers(process.env.MONGO_DNS_SERVERS.split(','));
}

const MONGO_URI = process.env.MONGO_URI;

async function checkUser() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const phone = '8989182028';
        const email = 'daddy202028@gmail.com';

        const userByEmail = await User.findOne({ email });
        const userByPhone = await User.findOne({ phoneNumber: phone });

        console.log('User by Email:', userByEmail ? 'Found' : 'Not Found');
        if (userByEmail) {
            console.log('User Email Details:', JSON.stringify(userByEmail, null, 2));
        }

        console.log('User by Phone:', userByPhone ? 'Found' : 'Not Found');
        if (userByPhone) {
            console.log('User Phone Details:', JSON.stringify(userByPhone, null, 2));
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkUser();
