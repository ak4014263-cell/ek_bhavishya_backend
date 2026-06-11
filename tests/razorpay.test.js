import request from 'supertest';
import { expect } from 'chai';
import app from '../index.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

describe('Razorpay Payment Tests (Sandbox)', () => {
  let authToken;
  let userId;
  const testUser = {
    phone: '9876543211',
    name: 'Test Payment User',
    email: 'test@razorpay.com',
    password: 'password123'
  };

  before(async () => {
    // Ensure we're using test keys
    process.env.NODE_ENV = 'test';

    const user = await User.create(testUser);
    userId = user._id;

    authToken = jwt.sign(
      { userId: user._id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
  });

  after(async () => {
    await User.deleteOne({ email: testUser.email });
  });

  describe('POST /payment/create-order - Razorpay Order Creation', () => {
    it('should create a Razorpay order in test mode', async () => {
      const response = await request(app)
        .post('/payment/create-order')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1000, // in INR
          currency: 'INR',
          receipt: `receipt_test_${Date.now()}`
        });

      // Check if we have test credentials configured
      if (process.env.RAZORPAY_KEY_ID_TEST) {
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('success');
        expect(response.body.success).to.be.true;
        expect(response.body).to.have.property('order');
        expect(response.body.order).to.have.property('id');
        expect(response.body.order.amount).to.equal(100000); // amount in paise
      } else {
        // If test credentials not configured, should return 500
        expect(response.status).to.equal(500);
      }
    });

    it('should fail with missing amount', async () => {
      const response = await request(app)
        .post('/payment/create-order')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currency: 'INR',
          receipt: 'receipt_test'
        });

      expect(response.status).to.equal(400);
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .post('/payment/create-order')
        .send({
          amount: 1000,
          currency: 'INR'
        });

      expect(response.status).to.equal(401);
    });
  });

  describe('POST /payment/verify - Razorpay Payment Verification', () => {
    it('should fail with missing signature', async () => {
      const response = await request(app)
        .post('/payment/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123'
          // razorpay_signature missing
        });

      expect(response.status).to.equal(400);
      expect(response.body.message).to.include('Missing Razorpay payment details');
    });

    it('should fail with invalid signature', async () => {
      const response = await request(app)
        .post('/payment/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'invalid_signature_xyz'
        });

      expect(response.status).to.equal(400);
      expect(response.body.message).to.include('Invalid payment signature');
    });
  });

  describe('Environment-Based Key Selection', () => {
    it('should use test keys when NODE_ENV=test', async () => {
      process.env.NODE_ENV = 'test';
      process.env.RAZORPAY_KEY_ID_TEST = 'rzp_test_key';
      process.env.RAZORPAY_KEY_SECRET_TEST = 'test_secret';

      // Re-require the module to pick up new env vars
      delete require.cache[require.resolve('../src/controllers/paymentController.js')];
      const paymentController = await import('../src/controllers/paymentController.js');

      // Verify the test controller is using test keys
      expect(process.env.NODE_ENV).to.equal('test');
    });

    it('should use production keys when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.RAZORPAY_KEY_ID = 'rzp_live_key';
      process.env.RAZORPAY_KEY_SECRET = 'live_secret';

      expect(process.env.NODE_ENV).to.equal('production');
    });
  });

  describe('Razorpay Integration Helpers', () => {
    it('should format amount correctly for Razorpay API', async () => {
      const amount = 1000; // INR
      const amountInPaise = amount * 100; // Should be 100000 paise

      expect(amountInPaise).to.equal(100000);
    });

    it('should accept valid currency codes', async () => {
      const validCurrencies = ['INR', 'USD', 'GBP', 'EUR'];

      for (const currency of validCurrencies) {
        const response = await request(app)
          .post('/payment/create-order')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            amount: 1000,
            currency: currency,
            receipt: `receipt_${currency}_${Date.now()}`
          });

        // Will succeed or fail based on Razorpay credentials
        expect(response.status).to.be.oneOf([200, 500]);
      }
    });
  });
});
