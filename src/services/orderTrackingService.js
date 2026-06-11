import Order from '../models/Order.js';
import { getIO } from '../socket/socketManager.js';

/**
 * Calculate estimated delivery date based on order type and current date
 */
export function calculateEstimatedDelivery(orderItems) {
  const baseDate = new Date();
  let processingDays = 1; // Default processing time
  let shippingDays = 3; // Default shipping time

  // Determine processing and shipping days based on item types
  const hasRemedy = orderItems?.some(item => item.itemType === 'Remedy');
  const hasCourse = orderItems?.some(item => item.itemType === 'Course');
  const hasPooja = orderItems?.some(item => item.itemType === 'Pooja');
  const hasProduct = orderItems?.some(item => item.itemType === 'Product');

  if (hasRemedy || hasPooja) {
    processingDays = 2; // Remedies and poojas need more time
    shippingDays = 1; // But typically local delivery
  } else if (hasCourse) {
    processingDays = 0; // Courses are instant
    shippingDays = 0;
  } else if (hasProduct) {
    processingDays = 1; // Standard processing
    shippingDays = 5; // 5-7 days shipping for products
  }

  // Add processing days
  baseDate.setDate(baseDate.getDate() + processingDays);

  // Add shipping days
  baseDate.setDate(baseDate.getDate() + shippingDays);

  // Skip weekends (optional - set to false if not needed)
  const skipWeekends = true;
  if (skipWeekends) {
    while ([0, 6].includes(baseDate.getDay())) {
      baseDate.setDate(baseDate.getDate() + 1);
    }
  }

  return baseDate;
}

/**
 * Get order tracking information
 */
export async function getOrderTracking(orderId) {
  try {
    const order = await Order.findById(orderId).populate('userId', 'name phone email');

    if (!order) {
      return {
        success: false,
        message: 'Order not found'
      };
    }

    const trackingInfo = {
      orderId: order._id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
      estimatedDelivery: order.estimatedDelivery || calculateEstimatedDelivery(order.items),
      items: order.items,
      totalAmount: order.totalAmount,
      shippingAddress: order.shippingAddress,
      timeline: generateTrackingTimeline(order)
    };

    return {
      success: true,
      data: trackingInfo
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Generate tracking timeline with checkpoints
 */
function generateTrackingTimeline(order) {
  const timeline = [
    {
      step: 'Order Placed',
      status: 'completed',
      date: order.createdAt,
      description: 'Your order has been placed'
    }
  ];

  // Add payment confirmation if applicable
  if (order.paymentStatus === 'paid') {
    timeline.push({
      step: 'Payment Confirmed',
      status: 'completed',
      date: order.updatedAt,
      description: 'Payment received'
    });
  } else if (order.paymentMethod === 'cod') {
    timeline.push({
      step: 'Payment Pending',
      status: 'pending',
      date: null,
      description: 'Payment will be collected on delivery'
    });
  }

  // Add processing status
  const processingDate = new Date(order.createdAt);
  processingDate.setHours(processingDate.getHours() + 2);

  timeline.push({
    step: 'Processing',
    status: order.status === 'processing' ? 'active' : order.status === 'confirmed' ? 'pending' : 'completed',
    date: processingDate,
    description: 'Your order is being prepared for shipment'
  });

  // Add shipped status
  const shippedDate = new Date(order.createdAt);
  shippedDate.setDate(shippedDate.getDate() + 1);

  timeline.push({
    step: 'Shipped',
    status: order.status === 'shipped' ? 'active' : order.status === 'delivered' ? 'completed' : 'pending',
    date: order.status === 'shipped' || order.status === 'delivered' ? shippedDate : null,
    description: 'Your order is on the way'
  });

  // Add delivery status
  timeline.push({
    step: 'Delivered',
    status: order.status === 'delivered' ? 'completed' : 'pending',
    date: order.status === 'delivered' ? order.deliveredAt : null,
    description: order.status === 'delivered' ? 'Order delivered' : `Expected by ${order.estimatedDelivery?.toLocaleDateString()}`
  });

  return timeline;
}

/**
 * Update order status and emit tracking update
 */
export async function updateOrderStatus(orderId, newStatus, updatedBy = 'system') {
  try {
    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        status: newStatus,
        updatedAt: new Date()
      },
      { new: true }
    ).populate('userId', 'name phone');

    if (!order) {
      return {
        success: false,
        message: 'Order not found'
      };
    }

    // Emit tracking update to user
    const io = getIO();
    if (io && order.userId) {
      const trackingInfo = generateTrackingTimeline(order);
      io.to(`user_${order.userId._id}`).emit('order_updated', {
        orderId: order._id,
        status: newStatus,
        timeline: trackingInfo,
        updatedAt: order.updatedAt
      });
    }

    return {
      success: true,
      data: order
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Bulk update multiple orders (e.g., batch shipment)
 */
export async function bulkUpdateOrderStatus(orderIds, newStatus) {
  try {
    const result = await Order.updateMany(
      { _id: { $in: orderIds } },
      { status: newStatus, updatedAt: new Date() }
    );

    // Get updated orders and emit updates
    const orders = await Order.find({ _id: { $in: orderIds } }).populate('userId');
    const io = getIO();

    if (io) {
      orders.forEach(order => {
        const trackingInfo = generateTrackingTimeline(order);
        io.to(`user_${order.userId._id}`).emit('order_updated', {
          orderId: order._id,
          status: newStatus,
          timeline: trackingInfo
        });
      });
    }

    return {
      success: true,
      modifiedCount: result.modifiedCount
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Get estimated delivery time remaining
 */
export function getDeliveryTimeRemaining(estimatedDelivery) {
  const now = new Date();
  const diffMs = estimatedDelivery - now;

  if (diffMs < 0) {
    return 'Delivery was expected';
  }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  } else {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  }
}
