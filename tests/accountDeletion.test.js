import request from 'supertest';
import { expect } from 'chai';
import app from '../index.js';
import User from '../src/models/User.js';
import Astrologer from '../src/models/Astrologer.js';
import Seller from '../src/models/Seller.js';
import Admin from '../src/modules/admin/models/admin.model.js';
import jwt from 'jsonwebtoken';

describe('Account Deletion Workflow Tests', () => {
  let userToken, adminToken;
  let testUserId, testAdminId;
  
  const testUser = {
    fullName: 'Deletion Test User',
    email: 'delete_test@example.com',
    password: 'password123',
    phoneNumber: '9999988888',
    role: 'user'
  };

  const testAdmin = {
    name: 'Test Admin',
    email: 'admin_delete_test@ekbhavishya.com',
    password: 'adminpassword',
    role: 'admin'
  };

  before(async () => {
    // Clean existing mock data if any
    await User.deleteMany({ email: { $in: [testUser.email, testAdmin.email] } });
    await Admin.deleteMany({ email: testAdmin.email });

    // Create test user
    const user = await User.create(testUser);
    testUserId = user._id;
    userToken = jwt.sign(
      { id: user._id, role: 'user' },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1d' }
    );

    // Create test admin
    const admin = await Admin.create(testAdmin);
    testAdminId = admin._id;
    adminToken = jwt.sign(
      { id: admin._id, email: admin.email, role: 'admin' },
      process.env.JWT_SECRET || 'secret',
      { issuer: 'astrology_app', expiresIn: '1d' }
    );
  });

  after(async () => {
    // Cleanup
    await User.deleteMany({ email: { $in: [testUser.email, testAdmin.email] } });
    await Admin.deleteMany({ email: testAdmin.email });
    await Astrologer.deleteMany({ userId: testUserId });
    await Seller.deleteMany({ userId: testUserId });
  });

  describe('User Requests Account Deletion', () => {
    it('should submit deletion request successfully', async () => {
      const res = await request(app)
        .post('/api/user/profile/delete-request')
        .set('Authorization', `Bearer ${userToken}`)
        .send();

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.message).to.include('deletion request');

      const updatedUser = await User.findById(testUserId);
      expect(updatedUser.deleteRequested).to.be.true;
      expect(updatedUser.deleteRequestedAt).to.exist;
      expect(updatedUser.isDeleted).to.be.false;
    });
  });

  describe('Admin View & Reject Deletion Request', () => {
    it('should allow admin to fetch deletion requests list', async () => {
      const res = await request(app)
        .get('/api/v1/admin/deletion-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.data).to.be.an('array');
      
      const found = res.body.data.find(u => u.email === testUser.email);
      expect(found).to.exist;
      expect(found.deleteRequested).to.be.true;
    });

    it('should allow admin to reject deletion request, restoring user status', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/deletion-requests/${testUserId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;

      const restoredUser = await User.findById(testUserId);
      expect(restoredUser.deleteRequested).to.be.false;
      expect(restoredUser.deleteRequestedAt).to.be.null;
    });
  });

  describe('Admin Approves Deletion Request', () => {
    before(async () => {
      // Re-trigger request deletion
      await User.findByIdAndUpdate(testUserId, { deleteRequested: true, deleteRequestedAt: new Date() });
    });

    it('should approve deletion and mark user as isDeleted', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/deletion-requests/${testUserId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;

      const deletedUser = await User.findById(testUserId);
      expect(deletedUser.isDeleted).to.be.true;
      expect(deletedUser.status).to.equal('Blocked');
    });

    it('should prevent deleted user from logging in via authController', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(res.status).to.equal(403);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.include('deleted');
    });

    it('should prevent deleted user from requestOtp/verifyOtp', async () => {
      const res = await request(app)
        .post('/api/user/email/request-otp')
        .send({ email: testUser.email });

      expect(res.status).to.equal(403);
      expect(res.body.success).to.be.false;
    });

    it('should prevent deleted user from logging in as astrologer', async () => {
      // Temporarily change role to astrologer and add dummy profile for role check
      await User.findByIdAndUpdate(testUserId, { role: 'astrologer' });
      await Astrologer.create({
        userId: testUserId,
        personalDetails: { name: 'Astro Deletion Test', email: testUser.email, phone: testUser.phoneNumber }
      });

      const res = await request(app)
        .post('/api/astrologer/login')
        .send({
          identifier: testUser.email,
          password: testUser.password
        });

      expect(res.status).to.equal(403);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.include('deleted');
    });

    it('should prevent deleted user from logging in as seller', async () => {
      // Change role to seller and add seller profile
      await User.findByIdAndUpdate(testUserId, { role: 'seller' });
      await Seller.create({
        userId: testUserId,
        storeName: 'Seller Deletion Test',
        email: testUser.email,
        phone_number: testUser.phoneNumber
      });

      const res = await request(app)
        .post('/api/seller/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(res.status).to.equal(403);
      expect(res.body.success).to.be.false;
      expect(res.body.message).to.include('deleted');
    });
  });
});
