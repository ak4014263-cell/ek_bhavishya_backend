import request from 'supertest';
import { expect } from 'chai';
import app from '../index.js';
import User from '../src/models/User.js';
import Order from '../src/models/Order.js';
import jwt from 'jsonwebtoken';

describe('Checkout Endpoint Tests', () => {
  let authToken;
  let userId;
  const testUser = {
    fullName: 'Test User',
    email: 'test@checkout.com',
    password: 'password123',
    phoneNumber: '9876543210',
    walletBalance: 5000
  };

  before(async () => {
    // Create test user
    const user = await User.create(testUser);
    userId = user._id;

    // Generate auth token
    authToken = jwt.sign(
      { userId: user._id, phone: user.phoneNumber },
      process.env.JWT_SECRET || 'jwt_secret',
      { expiresIn: '7d' }
    );
  });

  after(async () => {
    // Cleanup
    await User.deleteOne({ email: testUser.email });
    await Order.deleteMany({ userId });
  });

  describe('POST /checkout - Wallet Payment', () => {
    it('should successfully checkout with wallet payment when balance is sufficient', async () => {
      // Add items to cart first
      await request(app)
        .post('/user/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: 'product_001',
          quantity: 1
        });

      const response = await request(app)
        .post('/user/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentMethod: 'wallet'
        });

      expect(response.status).to.equal(201);
      expect(response.body).to.have.property('order');
      expect(response.body.order).to.have.property('_id');
      expect(response.body.order.paymentMethod).to.equal('wallet');
      expect(response.body.order.status).to.equal('confirmed');
    });

    it('should fail checkout with wallet payment when balance is insufficient', async () => {
      // Deplete wallet
      await User.updateOne({ _id: userId }, { walletBalance: 10 });

      // Add expensive items to cart
      await request(app)
        .post('/user/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: 'expensive_product',
          quantity: 100
        });

      const response = await request(app)
        .post('/user/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentMethod: 'wallet'
        });

      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('message');
      expect(response.body.message).to.include('insufficient balance');
    });
  });

  describe('POST /checkout - COD Payment', () => {
    it('should successfully checkout with COD payment', async () => {
      // Reset wallet
      await User.updateOne({ _id: userId }, { walletBalance: 0 });

      // Add items to cart
      await request(app)
        .post('/user/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: 'product_002',
          quantity: 1
        });

      const response = await request(app)
        .post('/user/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentMethod: 'COD'
        });

      expect(response.status).to.equal(201);
      expect(response.body.order.paymentMethod).to.equal('COD');
      expect(response.body.order.status).to.equal('pending'); // COD orders are pending
    });
  });

  describe('POST /checkout - Razorpay Payment', () => {
    it('should successfully checkout with razorpay payment', async () => {
      // Add items to cart
      await request(app)
        .post('/user/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: 'product_003',
          quantity: 1
        });

      const response = await request(app)
        .post('/user/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentMethod: 'razorpay'
        });

      expect(response.status).to.equal(201);
      expect(response.body.order.paymentMethod).to.equal('razorpay');
      expect(response.body.order.status).to.equal('payment_pending');
    });
  });

  describe('POST /checkout - Cart Clearing', () => {
    it('should clear cart after successful checkout', async () => {
      // Add items to cart
      await request(app)
        .post('/user/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: 'product_004',
          quantity: 2
        });

      // Verify items in cart
      let cartResponse = await request(app)
        .get('/user/cart')
        .set('Authorization', `Bearer ${authToken}`);
      expect(cartResponse.body.items.length).to.be.greaterThan(0);

      // Checkout
      await request(app)
        .post('/user/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentMethod: 'wallet'
        });

      // Verify cart is cleared
      cartResponse = await request(app)
        .get('/user/cart')
        .set('Authorization', `Bearer ${authToken}`);
      expect(cartResponse.body.items.length).to.equal(0);
    });
  });

  describe('POST /checkout - Error Handling', () => {
    it('should return 401 if user is not authenticated', async () => {
      const response = await request(app)
        .post('/user/checkout')
        .send({
          paymentMethod: 'wallet'
        });

      expect(response.status).to.equal(401);
    });

    it('should return 400 if empty cart', async () => {
      const response = await request(app)
        .post('/user/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentMethod: 'wallet'
        });

      expect(response.status).to.equal(400);
      expect(response.body.message).to.include('cart');
    });

    it('should return 400 for invalid payment method', async () => {
      // Add items to cart
      await request(app)
        .post('/user/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: 'product_005',
          quantity: 1
        });

      const response = await request(app)
        .post('/user/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentMethod: 'invalid_method'
        });

      expect(response.status).to.equal(400);
    });
  });

  describe('Transaction Creation', () => {
    it('should create transaction record for wallet payment', async () => {
      // Reset wallet balance
      await User.updateOne({ _id: userId }, { walletBalance: 5000 });

      // Add items to cart
      await request(app)
        .post('/user/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: 'product_006',
          quantity: 1
        });

      const checkoutResponse = await request(app)
        .post('/user/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentMethod: 'wallet'
        });

      expect(checkoutResponse.status).to.equal(201);

      // Verify transaction was created
      const Transaction = require('../src/models/Transaction').default;
      const transaction = await Transaction.findOne({ userId });
      expect(transaction).to.exist;
      expect(transaction.type).to.equal('payment');
    });
  });
});
