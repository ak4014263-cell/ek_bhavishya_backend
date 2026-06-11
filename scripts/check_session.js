import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';
import ChatSession from '../src/models/ChatSession.js';

dotenv.config();

if (process.env.MONGO_DNS_SERVERS) {
    dns.setServers(process.env.MONGO_DNS_SERVERS.split(','));
}

const MONGO_URI = process.env.MONGO_URI;

async function checkSession() {
    try {
        await mongoose.connect(MONGO_URI);
        const session = await ChatSession.findById('69e73a4962c7281bfad20a75');
        console.log('Session Status:', session?.status);
        console.log('Start Time:', session?.startTime);
        console.log('End Time:', session?.endTime);
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkSession();
