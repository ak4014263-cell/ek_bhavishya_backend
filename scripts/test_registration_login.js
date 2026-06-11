import axios from 'axios';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Astrologer from '../src/models/Astrologer.js';
import Seller from '../src/models/Seller.js';
import dotenv from 'dotenv';

dotenv.config();
import connectDB from '../src/config/db.js';

const API_URL = process.env.API_URL || 'http://localhost:5001/api';

const testRegistrationAndLogin = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB\n');

        // Generate unique test email
        const timestamp = Date.now();
        const testAstrologerEmail = `test_astro_${timestamp}@test.com`;
        const testSellerEmail = `test_seller_${timestamp}@test.com`;
        const testPassword = 'TestPass@123';

        console.log('=== TESTING ASTROLOGER REGISTRATION & LOGIN ===\n');
        
        // Register astrologer
        console.log('1. Registering astrologer...');
        try {
            const registerRes = await axios.post(`${API_URL}/v1/astrologer/register`, {
                name: 'Test Astrologer',
                email: testAstrologerEmail,
                phone: '9876543210',
                password: testPassword,
                experience: 5,
                gender: 'Male'
            });
            console.log('✓ Registration successful:', registerRes.data.message);
            console.log(`  Astrologer ID: ${registerRes.data._id}`);
        } catch (err) {
            console.log('✗ Registration failed:', err.response?.data?.message || err.message);
            throw err;
        }

        // Check database
        console.log('\n2. Checking database...');
        const dbUser = await User.findOne({ email: testAstrologerEmail });
        if (dbUser) {
            console.log(`✓ User found in DB`);
            console.log(`  Email: ${dbUser.email}`);
            console.log(`  Role: ${dbUser.role}`);
            console.log(`  Has password hash: ${!!dbUser.password}`);
            console.log(`  Password starts with $2: ${String(dbUser.password || '').startsWith('$2')}`);
            console.log(`  Status: ${dbUser.status}`);
            
            const dbAstro = await Astrologer.findOne({ userId: dbUser._id });
            if (dbAstro) {
                console.log(`✓ Astrologer profile found`);
                console.log(`  Approved: ${dbAstro.systemStatus?.isApproved || dbAstro.isApproved}`);
            } else {
                console.log('✗ Astrologer profile NOT found');
            }
        } else {
            console.log('✗ User NOT found in database');
        }

        // Try login
        console.log('\n3. Attempting login with same credentials...');
        try {
            const loginRes = await axios.post(`${API_URL}/v1/astrologer/login`, {
                email: testAstrologerEmail,
                password: testPassword
            });
            console.log('✓ Login successful!');
            console.log(`  Token: ${loginRes.data.token ? 'Present' : 'Missing'}`);
        } catch (err) {
            console.log('✗ Login failed:', err.response?.data?.message || err.message);
            if (err.response?.status === 401) {
                console.log('  → Checking password comparison manually...');
                if (dbUser) {
                    const isMatch = await dbUser.comparePassword(testPassword);
                    console.log(`  Password match result: ${isMatch}`);
                }
            }
        }

        console.log('\n\n=== TESTING SELLER REGISTRATION & LOGIN ===\n');

        // Register seller
        console.log('1. Registering seller...');
        try {
            const registerRes = await axios.post(`${API_URL}/v1/seller/register`, {
                fullName: 'Test Seller',
                email: testSellerEmail,
                password: testPassword,
                phoneNumber: '9876543211',
                storeName: 'Test Store'
            });
            console.log('✓ Registration successful:', registerRes.data.message);
            console.log(`  Seller ID: ${registerRes.data.data?.sellerId}`);
        } catch (err) {
            console.log('✗ Registration failed:', err.response?.data?.message || err.message);
            throw err;
        }

        // Check database
        console.log('\n2. Checking database...');
        const sellerUser = await User.findOne({ email: testSellerEmail });
        if (sellerUser) {
            console.log(`✓ User found in DB`);
            console.log(`  Email: ${sellerUser.email}`);
            console.log(`  Role: ${sellerUser.role}`);
            console.log(`  Has password hash: ${!!sellerUser.password}`);
            console.log(`  Password starts with $2: ${String(sellerUser.password || '').startsWith('$2')}`);
            console.log(`  Status: ${sellerUser.status}`);
            
            const dbSeller = await Seller.findOne({ userId: sellerUser._id });
            if (dbSeller) {
                console.log(`✓ Seller profile found`);
                console.log(`  Store: ${dbSeller.storeName}`);
                console.log(`  Approved: ${dbSeller.is_approved}`);
            } else {
                console.log('✗ Seller profile NOT found');
            }
        } else {
            console.log('✗ User NOT found in database');
        }

        // Try login
        console.log('\n3. Attempting login with same credentials...');
        try {
            const loginRes = await axios.post(`${API_URL}/v1/seller/login`, {
                email: testSellerEmail,
                password: testPassword
            });
            console.log('✓ Login successful!');
            console.log(`  Token: ${loginRes.data.data?.token ? 'Present' : 'Missing'}`);
        } catch (err) {
            console.log('✗ Login failed:', err.response?.data?.message || err.message);
            if (err.response?.status === 401) {
                console.log('  → Checking password comparison manually...');
                if (sellerUser) {
                    const isMatch = await sellerUser.comparePassword(testPassword);
                    console.log(`  Password match result: ${isMatch}`);
                }
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('\nError:', error.message);
        process.exit(1);
    }
};

testRegistrationAndLogin();
