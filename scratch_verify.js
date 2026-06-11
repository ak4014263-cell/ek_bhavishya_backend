import mongoose from 'mongoose';
import axios from 'axios';
import User from './src/models/User.js';
import Astrologer from './src/models/Astrologer.js';
import connectDB from './src/config/db.js';

const email = 'astrologer@test.com';
const password = 'password123';
const API_URL = 'http://127.0.0.1:5001/api'; // Base API URL

async function runTests() {
    try {
        await connectDB();
        console.log('Connected to MongoDB');

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            console.error('Test user not found. Please run seed_astrologer.js first.');
            process.exit(1);
        }

        const astrologer = await Astrologer.findOne({ userId: user._id });
        if (!astrologer) {
            console.error('Astrologer profile not found.');
            process.exit(1);
        }

        // Login to get token
        console.log('Logging in...');
        const loginRes = await axios.post(`${API_URL}/astrologer/login`, {
            email,
            password
        });
        const token = loginRes.data.token;
        console.log('Logged in successfully, token retrieved.');

        const axiosConfig = {
            headers: {
                Authorization: `Bearer ${token}`
            }
        };

        // TEST CASE 1: approvedAt = 1 month ago (LOCKED)
        console.log('\n--- Test Case 1: Approved 1 month ago (Should be Locked) ---');
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        astrologer.status = 'Approved';
        astrologer.approvedAt = oneMonthAgo;
        await astrologer.save();
        console.log(`Astrologer status set to Approved, approvedAt set to: ${oneMonthAgo.toDateString()}`);

        try {
            const response = await axios.put(`${API_URL}/astrologer/profile`, {
                pricing: { chat: 45, call: 50, video: 100 }
            }, axiosConfig);
            console.error('FAIL: Expected price update to be rejected, but it succeeded:');
            console.log(response.data);
        } catch (err) {
            if (err.response && err.response.status === 400) {
                console.log('PASS: Request was rejected with 400 Bad Request.');
                console.log('Response Message:', err.response.data.message);
            } else {
                console.error('FAIL: Unexpected error during Test Case 1:', err.message);
                if (err.response) console.log(err.response.data);
            }
        }

        // TEST CASE 2: approvedAt = 4 months ago (UNLOCKED)
        console.log('\n--- Test Case 2: Approved 4 months ago (Should be Unlocked) ---');
        const fourMonthsAgo = new Date();
        fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
        
        astrologer.status = 'Approved';
        astrologer.approvedAt = fourMonthsAgo;
        // Clean any existing pricingUpdateRequest
        astrologer.pricingUpdateRequest = undefined;
        await astrologer.save();
        console.log(`Astrologer status set to Approved, approvedAt set to: ${fourMonthsAgo.toDateString()}`);

        try {
            const response = await axios.put(`${API_URL}/astrologer/profile`, {
                pricing: { chat: 45, call: 50, video: 100 }
            }, axiosConfig);
            if (response.status === 200 && response.data.success) {
                console.log('PASS: Request succeeded with 200 OK.');
                console.log('Response Message:', response.data.message);
                console.log('Response Data (pricingUpdateRequest):', response.data.data.pricingUpdateRequest);
            } else {
                console.error('FAIL: Status code was not 200 or success was false:', response.status, response.data);
            }
        } catch (err) {
            console.error('FAIL: Error during Test Case 2:', err.message);
            if (err.response) console.log(err.response.data);
        }

        // Reset user and profile state to default seeded state (not Approved/no approvedAt)
        console.log('\nResetting astrologer to default state...');
        astrologer.status = 'Pending';
        astrologer.approvedAt = undefined;
        astrologer.pricingUpdateRequest = undefined;
        await astrologer.save();
        console.log('Reset complete.');

        process.exit(0);
    } catch (err) {
        console.error('Fatal testing error:', err);
        process.exit(1);
    }
}

runTests();
