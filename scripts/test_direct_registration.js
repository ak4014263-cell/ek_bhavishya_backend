import mongoose from 'mongoose';
import User from '../src/models/User.js';
import dotenv from 'dotenv';

dotenv.config();
import connectDB from '../src/config/db.js';

const testDirectFlow = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB\n');

        const testEmail = `test_direct_${Date.now()}@test.com`;
        const testPassword = 'DirectTest@123';

        console.log('=== TESTING DIRECT REGISTRATION & LOGIN ===\n');

        // Registration - Create user directly like the code does
        console.log('1. Creating user with password (like registration)...');
        const user = await User.create({
            fullName: 'Test User',
            email: testEmail,
            password: testPassword,
            phoneNumber: '9876543215',
            role: 'astrologer'
        });
        
        console.log(`✓ User created`);
        console.log(`  Email: ${user.email}`);
        console.log(`  Password hash present: ${!!user.password}`);
        console.log(`  Password hash starts with $2: ${String(user.password || '').startsWith('$2')}`);
        console.log(`  Password length: ${String(user.password || '').length}`);

        // Find user like login does
        console.log('\n2. Finding user by email (like login)...');
        const foundUser = await User.findOne({ email: testEmail });
        
        if (!foundUser) {
            console.log('✗ User NOT found!');
            process.exit(1);
        }
        
        console.log(`✓ User found`);
        console.log(`  Email: ${foundUser.email}`);
        console.log(`  Password hash present: ${!!foundUser.password}`);
        console.log(`  Password hash starts with $2: ${String(foundUser.password || '').startsWith('$2')}`);

        // Compare password like login does
        console.log('\n3. Comparing password (like login)...');
        console.log(`  Input password: ${testPassword}`);
        const isMatch = await foundUser.comparePassword(testPassword);
        
        console.log(`  comparePassword result: ${isMatch}`);
        
        if (isMatch) {
            console.log('✓ PASSWORD MATCH - Login should work!');
        } else {
            console.log('✗ PASSWORD MISMATCH - This is the bug!');
            
            // Debug info
            console.log('\n--- DEBUG INFO ---');
            console.log('Trying to understand why compare failed...');
            
            // Try manual bcrypt
            const bcrypt = require('bcryptjs');
            const manualMatch = await bcrypt.compare(testPassword, foundUser.password);
            console.log(`Manual bcrypt.compare: ${manualMatch}`);
            
            if (!manualMatch) {
                console.log(`\nPassword hash in DB: ${foundUser.password.substring(0, 20)}...`);
                console.log(`Provided password: ${testPassword}`);
                console.log('\nThis suggests the password wasn\'t hashed properly during registration');
            }
        }

        process.exit(isMatch ? 0 : 1);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

testDirectFlow();