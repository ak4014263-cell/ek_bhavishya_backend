import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';
import Admin from './src/modules/admin/models/admin.model.js';

dotenv.config();

const seedAdmin = async () => {
    try {
        if (process.env.MONGO_DNS_SERVERS) {
            const servers = process.env.MONGO_DNS_SERVERS.split(',');
            dns.setServers(servers);
            console.log(`Using custom DNS servers: ${servers.join(', ')}`);
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const email = 'admin@ekbhavishya.com';
        const password = 'adminpassword';

        const existingAdmin = await Admin.findOne({ email });
        if (existingAdmin) {
            console.log('Admin already exists');
        } else {
            await Admin.create({
                name: 'Super Admin',
                email,
                password,
                role: 'admin'
            });
            console.log('Admin created successfully');
            console.log('Email: ' + email);
            console.log('Password: ' + password);
        }

        await mongoose.connection.close();
    } catch (error) {
        console.error('Error seeding admin:', error);
        process.exit(1);
    }
};

seedAdmin();
