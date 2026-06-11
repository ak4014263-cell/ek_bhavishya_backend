import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config();

const connectDB = async () => {
    try {
        if (process.env.MONGO_DNS_SERVERS) {
            const servers = process.env.MONGO_DNS_SERVERS.split(',');
            dns.setServers(servers);
            console.log(`[DB] Using custom DNS servers: ${servers.join(', ')}`);
        }
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

export default connectDB;
