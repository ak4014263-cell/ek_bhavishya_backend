import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';
import User from './src/models/User.js';
import Seller from './src/models/Seller.js';

dotenv.config();

const seedSeller = async () => {
    try {
        if (process.env.MONGO_DNS_SERVERS) {
            const servers = process.env.MONGO_DNS_SERVERS.split(',');
            dns.setServers(servers);
            console.log(`Using custom DNS servers: ${servers.join(', ')}`);
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const email = 'seller@ekbhavishya.com';
        const password = 'sellerpassword';

        let user = await User.findOne({ email });
        if (user) {
            console.log('User already exists, updating role to seller');
            user.role = 'seller';
            await user.save();
        } else {
            user = await User.create({
                fullName: 'Sample Seller',
                email,
                password,
                role: 'seller',
                phoneNumber: '7777777777'
            });
            console.log('Seller user created successfully');
        }

        const existingSeller = await Seller.findOne({ userId: user._id });
        if (existingSeller) {
            console.log('Seller document already exists');
        } else {
            await Seller.create({
                userId: user._id,
                storeName: 'Ek Bhavishya Gemstones',
                description: 'Quality gemstones for your future.',
                rating: 5
            });
            console.log('Seller profile created successfully');
        }

        console.log('\n--- Seller Credentials ---');
        console.log('Email: ' + email);
        console.log('Password: ' + password);
        console.log('--------------------------\n');

        await mongoose.connection.close();
    } catch (error) {
        console.error('Error seeding seller:', error);
        process.exit(1);
    }
};

seedSeller();
