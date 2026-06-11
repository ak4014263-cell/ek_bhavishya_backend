import mongoose from 'mongoose';
import User from '../src/models/User.js';
import { findUserByIdentifier, resolveLoginAstrologer } from '../src/utils/astrologerLink.js';
import dotenv from 'dotenv';

dotenv.config();
import connectDB from '../src/config/db.js';

const testIdentifierFinding = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB\n');

        const testEmail = `test_identifier_${Date.now()}@test.com`;
        const testPhone = '9876543216';
        const testPassword = 'IdentifierTest@123';

        console.log('=== TESTING IDENTIFIER FINDING ===\n');

        // Create user
        console.log('1. Creating user with email and phone...');
        const user = await User.create({
            fullName: 'Test User',
            email: testEmail,
            password: testPassword,
            phoneNumber: testPhone,
            role: 'astrologer'
        });
        console.log(`✓ User created: ${testEmail}`);

        // Test findUserByIdentifier with email
        console.log('\n2. Testing findUserByIdentifier with email...');
        const foundByEmail = await findUserByIdentifier(testEmail);
        console.log(`  Result: ${foundByEmail ? 'FOUND' : 'NOT FOUND'}`);
        if (foundByEmail) {
            console.log(`  Email: ${foundByEmail.email}`);
            console.log(`  Phone: ${foundByEmail.phoneNumber}`);
        }

        // Test findUserByIdentifier with phone
        console.log('\n3. Testing findUserByIdentifier with phone...');
        const foundByPhone = await findUserByIdentifier(testPhone);
        console.log(`  Result: ${foundByPhone ? 'FOUND' : 'NOT FOUND'}`);
        if (foundByPhone) {
            console.log(`  Email: ${foundByPhone.email}`);
            console.log(`  Phone: ${foundByPhone.phoneNumber}`);
        }

        // Test with variations
        console.log('\n4. Testing with email variations...');
        const variations = [
            testEmail,
            testEmail.toUpperCase(),
            testEmail.trim(),
            `  ${testEmail}  `,
        ];
        
        for (const variation of variations) {
            const found = await findUserByIdentifier(variation);
            console.log(`  "${variation}": ${found ? 'FOUND' : 'NOT FOUND'}`);
        }

        // Test resolveLoginAstrologer
        console.log('\n5. Testing resolveLoginAstrologer...');
        const resolved = await resolveLoginAstrologer(testEmail);
        console.log(`  User found: ${resolved.user ? 'YES' : 'NO'}`);
        console.log(`  Astrologer profile found: ${resolved.astrologer ? 'YES' : 'NO'}`);
        
        if (resolved.user) {
            console.log(`  User email: ${resolved.user.email}`);
            console.log(`  User role: ${resolved.user.role}`);
            const isMatch = await resolved.user.comparePassword(testPassword);
            console.log(`  Password match: ${isMatch}`);
        }

        console.log('\n✓ All identifier tests passed!');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

testIdentifierFinding();