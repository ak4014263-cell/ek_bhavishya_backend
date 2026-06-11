import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import Transaction from '../models/Transaction.js';
import Order from '../models/Order.js';
import { createNotification } from './notificationService.js';

const commissionPercent = () => {
    const raw = process.env.SELLER_PLATFORM_COMMISSION_PERCENT;
    const n = raw != null ? Number(raw) : 10;
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 10;
};

export const shouldCreditSellerEarnings = (order) => {
    if (!order || order.sellerEarningsCredited) return false;
    if (order.paymentMethod === 'cod') {
        return order.status === 'delivered';
    }
    return order.paymentStatus === 'paid';
};

/**
 * Credit each seller their share of a paid/delivered order (idempotent per seller per order).
 */
export const creditSellersForOrder = async (order) => {
    if (!shouldCreditSellerEarnings(order)) return { credited: false };

    const orderDoc = order.sellerEarningsCredited != null
        ? order
        : await Order.findById(order._id || order);

    if (!orderDoc || !shouldCreditSellerEarnings(orderDoc)) {
        return { credited: false };
    }

    const sellerTotals = new Map();

    for (const item of orderDoc.items || []) {
        if (item.itemType !== 'Product' || !item.productId) continue;
        const product = await Product.findById(item.productId).select('seller_id');
        if (!product?.seller_id) continue;
        const lineTotal = (item.price || 0) * (item.quantity || 1);
        const key = product.seller_id.toString();
        sellerTotals.set(key, (sellerTotals.get(key) || 0) + lineTotal);
    }

    if (sellerTotals.size === 0) {
        orderDoc.sellerEarningsCredited = true;
        await orderDoc.save();
        return { credited: false, reason: 'no_seller_products' };
    }

    const pct = commissionPercent();
    const results = [];

    for (const [sellerId, gross] of sellerTotals.entries()) {
        const existing = await Transaction.findOne({
            sellerId,
            referenceId: orderDoc._id,
            referenceType: 'Order',
            type: 'credit',
        });
        if (existing) continue;

        const net = Math.round(gross * (100 - pct)) / 100;
        if (net <= 0) continue;

        const seller = await Seller.findById(sellerId);
        if (!seller) continue;

        seller.walletBalance = (seller.walletBalance || 0) + net;
        await seller.save();

        await Transaction.create({
            sellerId: seller._id,
            amount: net,
            type: 'credit',
            status: 'completed',
            description: `Earnings from order #${String(orderDoc._id).slice(-6)} (${pct}% platform fee applied)`,
            referenceId: orderDoc._id,
            referenceType: 'Order',
        });

        if (seller.userId) {
            await createNotification({
                userId: seller.userId,
                title: 'Sale credited',
                body: `₹${net.toFixed(2)} added to your wallet for a product sale.`,
                type: 'payout',
            });
        }

        results.push({ sellerId, amount: net });
    }

    orderDoc.sellerEarningsCredited = true;
    await orderDoc.save();

    return { credited: results.length > 0, sellers: results };
};
