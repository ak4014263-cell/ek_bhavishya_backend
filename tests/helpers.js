import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Connect to test database
 */
export async function connectTestDatabase() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/ekbhavishya_test';

  try {
    await mongoose.connect(mongoUri);
    console.log('Test database connected');
  } catch (error) {
    console.error('Test database connection failed:', error.message);
    process.exit(1);
  }
}

/**
 * Disconnect from test database
 */
export async function disconnectTestDatabase() {
  try {
    await mongoose.disconnect();
    console.log('Test database disconnected');
  } catch (error) {
    console.error('Test database disconnection failed:', error.message);
  }
}

/**
 * Clear all collections (useful for test cleanup)
 */
export async function clearDatabase() {
  const collections = mongoose.connection.collections;

  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
}

/**
 * Generate mock JWT token for testing
 */
export function generateTestToken(userId, phone) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { userId, phone },
    process.env.JWT_SECRET || 'test_secret',
    { expiresIn: '7d' }
  );
}

/**
 * Create test user with wallet
 */
export async function createTestUser(userData = {}) {
  const User = require('../src/models/User.js').default;
  const Wallet = require('../src/models/Wallet.js').default;

  const defaultUser = {
    phone: `98765${Math.floor(Math.random() * 100000)}`,
    name: 'Test User',
    email: `test_${Date.now()}@test.com`,
    password: 'password123',
    ...userData
  };

  const user = await User.create(defaultUser);

  // Create wallet for user
  await Wallet.create({
    userId: user._id,
    balance: 5000 // Default test balance
  });

  return user;
}

/**
 * Verify payment signature (mock)
 */
export function verifyPaymentSignature(orderId, paymentId, signature) {
  const crypto = require('crypto');
  const secret = process.env.RAZORPAY_KEY_SECRET_TEST || process.env.RAZORPAY_KEY_SECRET;

  const generated_signature = crypto
    .createHmac('sha256', secret)
    .update(orderId + '|' + paymentId)
    .digest('hex');

  return generated_signature === signature;
}
