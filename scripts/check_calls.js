import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';
import CallSession from '../src/models/CallSession.js';

dotenv.config();

if (process.env.MONGO_DNS_SERVERS) {
    dns.setServers(process.env.MONGO_DNS_SERVERS.split(','));
}

const MONGO_URI = process.env.MONGO_URI;

async function checkCalls() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');
        
        const count = await CallSession.countDocuments();
        console.log('Total CallSessions:', count);
        
        const latest = await CallSession.find().limit(5).sort({ createdAt: -1 });
        console.log('Latest CallSessions:', JSON.stringify(latest, null, 2));
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkCalls();
