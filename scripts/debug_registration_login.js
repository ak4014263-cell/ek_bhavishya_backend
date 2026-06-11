import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Astrologer from '../src/models/Astrologer.js';
import Seller from '../src/models/Seller.js';
import dotenv from 'dotenv';

dotenv.config();
import connectDB from '../src/config/db.js';

const debugRegistrationAndLogin = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB\n');

        const email = process.argv[2] || `debug_test_${Date.now()}@test.com`;
        const password = process.argv[3] || 'DebugTest@123';
        const role = process.argv[4] || 'astrologer';

        console.log('=== DETAILED DEBUG LOG ===\n');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
        console.log(`Role: ${role}\n`);

        // STEP 1: Registration
        console.log('--- STEP 1: Registration ---');
        console.log('Input email:', email);
        console.log('Input password:', password);

        if (role === 'astrologer') {
            const normalizedEmail = email.trim().toLowerCase();
            console.log('Normalized email:', normalizedEmail);

            const user = await User.create({
                fullName: 'Debug User',
                email: normalizedEmail,
                password, // Will be hashed by pre-save hook
                phoneNumber: '9876543299',
                role: 'astrologer'
            });

            console.log('\nUser created:');
            console.log('  ID:', user._id.toString());
            console.log('  Email in DB:', user.email);
            console.log('  Password hash:', String(user.password).substring(0, 30) + '...');
            console.log('  Password hash is bcrypt:', String(user.password).startsWith('$2'));

            // Create astrologer profile
            const astrologer = await Astrologer.create({
                userId: user._id,
                personalDetails: {
                    name: 'Debug Astro',
                    email,
                    phone: '9876543299'
                },
                systemStatus: { isApproved: false, isVerified: false }
            });
            console.log('  Astrologer profile created:', astrologer._id.toString());

            // STEP 2: Try to find user for login (with different email variations)
            console.log('\n--- STEP 2: Login Attempt with Email Variations ---');
            
            const variations = [
                email,
                email.toLowerCase(),
                email.trim(),
                email.trim().toLowerCase(),
                email.toUpperCase(),
                ` ${email} `,
            ];

            for (const variation of variations) {
                const found = await User.findOne({ email: variation.trim().toLowerCase() });
                console.log(`\nTrying email: "${variation}"`);
                console.log(`Trimmed + lowercased: "${variation.trim().toLowerCase()}"`);
                console.log(`Found in DB: ${!!found}`);
                
                if (found) {
                    console.log(`  Matching DB email: "${found.email}"`);
                    const passwordMatch = await found.comparePassword(password);
                    console.log(`  Password match: ${passwordMatch}`);
                    
                    if (!passwordMatch) {
                        console.log(`  ⚠ Password provided: "${password}"`);
                        console.log(`  ⚠ Hash in DB starts with: ${String(found.password).substring(0, 10)}`);
                    }
                }
            }

            // STEP 3: Simulate exact login flow
            console.log('\n--- STEP 3: Exact Login Flow ---');
            console.log('Input to login endpoint:');
            console.log(`  email: "${email}"`);
            console.log(`  password: "${password}"`);

            // This simulates the actual astrologer login endpoint
            const identifierForLogin = email;
            const passwordForLogin = password;

            // Step 3a: Find user
            let loginUser;
            if (identifierForLogin.includes('@')) {
                const emailRegex = new RegExp(`^${identifierForLogin.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
                loginUser = await User.findOne({ email: emailRegex });
            }

            console.log('\nStep 3a - Find user:');
            console.log(`  User found: ${!!loginUser}`);
            if (!loginUser) {
                console.log('  ✗ LOGIN WOULD FAIL: User not found');
                console.log(`  Searched for regex: ^${identifierForLogin.trim()}$ (case-insensitive)`);
                process.exit(1);
            }
            console.log(`  Email found: ${loginUser.email}`);

            // Step 3b: Check password hash exists
            console.log('\nStep 3b - Check password hash:');
            console.log(`  Has password hash: ${!!loginUser.password}`);
            if (!loginUser.password) {
                console.log('  ✗ LOGIN WOULD FAIL: No password hash');
                process.exit(1);
            }

            // Step 3c: Compare password
            console.log('\nStep 3c - Compare password:');
            const isPasswordMatch = await loginUser.comparePassword(passwordForLogin);
            console.log(`  Password match: ${isPasswordMatch}`);
            
            if (!isPasswordMatch) {
                console.log('  ✗ LOGIN WOULD FAIL: Invalid credentials');
                console.log('  DEBUG: Manually testing bcrypt...');
                const bcrypt = require('bcryptjs');
                try {
                    const manualMatch = await bcrypt.compare(passwordForLogin, loginUser.password);
                    console.log(`  Manual bcrypt result: ${manualMatch}`);
                } catch (err) {
                    console.log(`  Manual bcrypt error: ${err.message}`);
                }
                process.exit(1);
            }

            console.log('  ✓ Password verified');

            console.log('\n\n=== RESULT ===');
            console.log('✓ Registration and login flow would SUCCEED');
            console.log('\nCredentials for next login:');
            console.log(`  Email: ${loginUser.email}`);
            console.log(`  Password: ${password}`);
            console.log(`  Endpoint: POST /api/v1/astrologer/login`);
            console.log(`  Content-Type: application/json`);

        } else if (role === 'seller') {
            // Similar flow for seller...
            console.log('Seller test not yet implemented. Please use astrologer role.');
        }

        process.exit(0);
    } catch (error) {
        console.error('\n✗ Error:', error.message);
        process.exit(1);
    }
};

debugRegistrationAndLogin();
