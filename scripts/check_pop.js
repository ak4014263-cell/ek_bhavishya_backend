import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';
import CallSession from '../src/models/CallSession.js';

dotenv.config();

if (process.env.MONGO_DNS_SERVERS) {
    dns.setServers(process.env.MONGO_DNS_SERVERS.split(','));
}

const MONGO_URI = process.env.MONGO_URI;

async function checkUserCalls() {
    try {
        await mongoose.connect(MONGO_URI);
        const userId = '69d9fc29df7968beff4b1b55';
        console.log('Checking calls for user:', userId);
        
        const calls = await CallSession.find({ userId: userId });
        console.log('Found calls:', calls.length);
        
        // Try population manually
        for (const call of calls) {
            try {
                await call.populate({
                    path: 'astrologerId',
                    populate: { path: 'userId', select: 'fullName profilePhoto' }
                });
                console.log('Populated call:', call._id);
            } catch (popError) {
                console.error('Population failed for call:', call._id, popError.message);
            }
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkUserCalls();
