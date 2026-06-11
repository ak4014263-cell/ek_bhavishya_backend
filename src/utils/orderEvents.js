import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import { createNotification } from './notificationService.js';
import { getIO } from '../socket/socketManager.js';
import { creditSellersForOrder } from './sellerEarnings.js';

/** Resolve sellers who have products in this order */
export const getSellersForOrder = async (order) => {
    const sellerIdSet = new Set();
    for (const item of order.items || []) {
        if (item.itemType !== 'Product' || !item.productId) continue;
        const product = await Product.findById(item.productId).select('seller_id');
        if (product?.seller_id) sellerIdSet.add(product.seller_id.toString());
    }
    if (sellerIdSet.size === 0) return [];
    return Seller.find({ _id: { $in: [...sellerIdSet] } }).select('userId storeName');
};

const orderRef = (order) => String(order._id || '').slice(-6).toUpperCase();

/**
 * Notify each seller and broadcast order_created.
 */
export const notifySellersNewOrder = async (order) => {
    const sellers = await getSellersForOrder(order);
    const ref = orderRef(order);

    for (const seller of sellers) {
        if (!seller.userId) continue;
        await createNotification({
            userId: seller.userId,
            title: 'New order received',
            body: `Order #${ref} — ₹${order.totalAmount ?? 0}. Open Orders to manage.`,
            type: 'order',
            data: { orderId: String(order._id), status: order.status },
        });
    }

    broadcastOrderEvent(order, 'order_created');
};

/**
 * Notify buyer, sellers, and all connected clients when status changes.
 */
export const broadcastOrderStatusChange = async (order, { notifyUser = true, creditEarnings = true } = {}) => {
    const ref = orderRef(order);
    const statusLabel = (order.status || 'updated').replace(/_/g, ' ');

    if (notifyUser && order.userId) {
        await createNotification({
            userId: order.userId,
            title: 'Order status updated',
            body: `Order #${ref} is now ${statusLabel}.`,
            type: 'order',
            data: { orderId: String(order._id), status: order.status },
        });
    }

    const sellers = await getSellersForOrder(order);
    for (const seller of sellers) {
        if (!seller.userId) continue;
        await createNotification({
            userId: seller.userId,
            title: 'Order status updated',
            body: `Order #${ref} marked as ${statusLabel}.`,
            type: 'order',
            data: { orderId: String(order._id), status: order.status },
        });
    }

    if (creditEarnings) {
        await creditSellersForOrder(order);
    }

    broadcastOrderEvent(order, 'order_updated');
};

export const broadcastOrderEvent = (order, eventName = 'order_updated') => {
    try {
        const io = getIO();
        if (!io || !order) return;

        const payload = {
            orderId: order._id,
            status: order.status,
            paymentStatus: order.paymentStatus,
            totalAmount: order.totalAmount,
            order,
        };

        if (order.userId) {
            io.to(`user_${order.userId}`).emit(eventName, payload);
            io.to(`user_${order.userId}`).emit('order_updated', payload);
        }

        io.emit(eventName, payload);
        io.emit('order_updated', payload);
    } catch (err) {
        console.error('broadcastOrderEvent failed:', err.message);
    }
};
