import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Astrologer from '../src/models/Astrologer.js';
import { resolveAstrologerForUser, resolveLoginAstrologer } from '../src/utils/astrologerLink.js';
import dotenv from 'dotenv';

dotenv.config();
import connectDB from '../src/config/db.js';

const simulateCompleteFlow = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB\n');

        const timestamp = Date.now();
        const testEmail = `complete_test_${timestamp}@test.com`;
        const testPassword = 'CompleteFlow@123';

        console.log('=== SIMULATING COMPLETE ASTROLOGER REGISTRATION & LOGIN ===\n');

        // REGISTRATION PHASE
        console.log('REGISTRATION PHASE:');
        console.log('1. Creating User (like registerAstrologer does)...');
        
        const normalizedEmail = testEmail.trim().toLowerCase();
        const user = await User.create({
            fullName: 'Complete Test Astrologer',
            email: normalizedEmail,
            password: testPassword,
            phoneNumber: '9876543217',
            gender: 'Male',
            role: 'astrologer'
        });
        console.log(`✓ User created with ID: ${user._id}`);
        console.log(`  Email stored: ${user.email}`);
        console.log(`  Password hash: ${String(user.password || '').substring(0, 20)}...`);

        console.log('\n2. Creating Astrologer profile (like registerAstrologer does)...');
        const astrologer = await Astrologer.create({
            userId: user._id,
            personalDetails: {
                name: 'Complete Test Astrologer',
                email: testEmail, // Note: this is the original email, not normalized
                phone: '9876543217',
                gender: 'Male',
                experience: 5,
                languages: ['English'],
                skills: ['Vedic'],
                categories: ['Career']
            },
            documents: {},
            pricing: { chat: 10, call: 15, video: 25 },
            availability: {
                isChatAvailable: false,
                isCallAvailable: false,
                isVideoAvailable: false
            },
            systemStatus: {
                isApproved: false,
                isVerified: false
            }
        });
        console.log(`✓ Astrologer profile created with ID: ${astrologer._id}`);
        console.log(`  Email in profile: ${astrologer.personalDetails.email}`);

        console.log('\n\nLOGIN PHASE:');
        console.log('1. Resolving login (like loginAstrologer does)...');
        
        // Use the exact email provided during login (might not be normalized)
        const { user: loginUser, astrologer: loginAstrologer } = await resolveLoginAstrologer(testEmail);
        
        if (!loginUser) {
            console.log('✗ ERROR: User not found during login!');
            process.exit(1);
        }
        console.log(`✓ User found`);
        console.log(`  Found email: ${loginUser.email}`);

        console.log('\n2. Checking role...');
        console.log(`  User role: ${loginUser.role}`);
        if (!['admin', 'seller'].includes(loginUser.role)) {
            console.log('✓ Role check passed');
        }

        console.log('\n3. Checking password...');
        console.log(`  Has password hash: ${!!loginUser.password}`);
        
        if (!loginUser.password) {
            console.log('✗ ERROR: No password hash!');
            process.exit(1);
        }

        const isMatch = await loginUser.comparePassword(testPassword);
        console.log(`  Password match: ${isMatch}`);
        
        if (!isMatch) {
            console.log('✗ ERROR: Password does not match!');
            process.exit(1);
        }
        console.log('✓ Password verified');

        console.log('\n4. Checking astrologer profile...');
        console.log(`  Profile found: ${!!loginAstrologer}`);
        if (!loginAstrologer) {
            console.log('⚠ Warning: No astrologer profile found');
            // Try to resolve it
            const resolved = await resolveAstrologerForUser(loginUser);
            console.log(`  After resolution: ${!!resolved}`);
        } else {
            console.log(`  Approved: ${loginAstrologer.systemStatus?.isApproved}`);
        }

        console.log('\n✓ COMPLETE FLOW SUCCESSFUL!');
        console.log('\nIf this works, the issue might be:');
        console.log('- Email case sensitivity in requests');
        console.log('- Extra whitespace in email field');
        console.log('- Client-side password modification');
        console.log('- API endpoint issue (check body parsing)');
        
        process.exit(0);
    } catch (error) {
        console.error('\n✗ Error:', error.message);
        if (error.stack) {
            console.error('Stack trace:', error.stack.split('\n').slice(0, 5).join('\n'));
        }
        process.exit(1);
    }
};

simulateCompleteFlow();