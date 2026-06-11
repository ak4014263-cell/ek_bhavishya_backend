import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getOrderTracking,
  updateOrderStatus,
  bulkUpdateOrderStatus,
  getDeliveryTimeRemaining,
  calculateEstimatedDelivery
} from '../services/orderTrackingService.js';
import Order from '../models/Order.js';

const router = express.Router();

/**
 * GET /api/tracking/:orderId
 * Get tracking information for a specific order
 */
router.get('/:orderId', protect, async (req, res) => {
  try {
    const { orderId } = req.params;
    const trackingInfo = await getOrderTracking(orderId);

    // Verify user owns this order
    const order = await Order.findById(orderId);
    if (!order || order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to this order'
      });
    }

    res.status(200).json(trackingInfo);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/tracking/user/all
 * Get all tracking information for user's orders
 */
router.get('/user/orders/all', protect, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .select('_id status paymentStatus totalAmount estimatedDelivery createdAt items');

    const trackingData = orders.map(order => ({
      orderId: order._id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount,
      estimatedDelivery: order.estimatedDelivery,
      createdAt: order.createdAt,
      itemCount: order.items?.length || 0,
      timeRemaining: getDeliveryTimeRemaining(order.estimatedDelivery)
    }));

    res.status(200).json({
      success: true,
      data: trackingData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/tracking/:orderId/timeline
 * Get detailed timeline for an order
 */
router.get('/:orderId/timeline', protect, async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order || order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to this order'
      });
    }

    const trackingInfo = await getOrderTracking(orderId);

    res.status(200).json({
      success: true,
      timeline: trackingInfo.data?.timeline || []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/tracking/:orderId/eta
 * Get estimated time to delivery
 */
router.get('/:orderId/eta', protect, async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order || order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to this order'
      });
    }

    const estimatedDelivery = order.estimatedDelivery;
    const timeRemaining = getDeliveryTimeRemaining(estimatedDelivery);

    res.status(200).json({
      success: true,
      data: {
        orderId,
        estimatedDelivery,
        timeRemaining,
        status: order.status,
        deliveryAddress: order.shippingAddress
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Admin Routes - Update order status
 * POST /api/tracking/:orderId/update-status
 */
router.post('/:orderId/update-status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const result = await updateOrderStatus(orderId, status, req.user?.role || 'system');

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Admin Routes - Bulk update order status
 * POST /api/tracking/bulk/update-status
 */
router.post('/bulk/update-status', async (req, res) => {
  try {
    const { orderIds, status } = req.body;

    if (!Array.isArray(orderIds) || !status) {
      return res.status(400).json({
        success: false,
        message: 'orderIds array and status are required'
      });
    }

    const result = await bulkUpdateOrderStatus(orderIds, status);

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/tracking/calculate-delivery
 * Calculate estimated delivery date for new order
 */
router.post('/calculate-delivery', (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: 'Items array is required'
      });
    }

    const estimatedDelivery = calculateEstimatedDelivery(items);

    res.status(200).json({
      success: true,
      data: {
        estimatedDelivery,
        daysFromNow: Math.ceil((estimatedDelivery - new Date()) / (1000 * 60 * 60 * 24))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
