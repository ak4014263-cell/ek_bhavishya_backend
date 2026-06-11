import nodemailer from 'nodemailer';
import { Resend } from 'resend';

/**
 * COD Payment Confirmation Service
 * Handles sending SMS and Email confirmations for Cash on Delivery orders
 */

// Initialize email transporter
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Initialize Resend client for backup email
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send COD Order Confirmation via Email
 */
export async function sendCODConfirmationEmail(order, user) {
  try {
    const html = generateCODEmailTemplate(order, user);

    // Primary: Try nodemailer (Gmail)
    try {
      await emailTransporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: `Order Confirmation - Order #${order._id}`,
        html: html
      });
      console.log(`Email sent to ${user.email} via Gmail`);
      return true;
    } catch (error) {
      console.error('Gmail send failed, trying Resend:', error.message);

      // Fallback: Resend
      await resend.emails.send({
        from: process.env.RESEND_FROM || 'no-reply@ekbhavishya.com',
        to: user.email,
        subject: `Order Confirmation - Order #${order._id}`,
        html: html
      });
      console.log(`Email sent to ${user.email} via Resend`);
      return true;
    }
  } catch (error) {
    console.error('Failed to send COD confirmation email:', error.message);
    return false;
  }
}

/**
 * Send COD Order Confirmation via SMS (Placeholder - integrate with Twilio/AWS SNS)
 */
export async function sendCODConfirmationSMS(order, user) {
  try {
    // Placeholder: Integrate with Twilio or AWS SNS
    const message = generateCODSMSTemplate(order, user);

    // TODO: Implement actual SMS sending
    // const response = await twilioClient.messages.create({
    //   body: message,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: user.phone
    // });

    console.log(`[SMS PLACEHOLDER] Would send SMS to ${user.phone}: ${message}`);
    return true;
  } catch (error) {
    console.error('Failed to send COD confirmation SMS:', error.message);
    return false;
  }
}

/**
 * Send both Email and SMS confirmations
 */
export async function sendCODConfirmation(order, user) {
  const emailResult = await sendCODConfirmationEmail(order, user);
  const smsResult = await sendCODConfirmationSMS(order, user);

  return {
    emailSent: emailResult,
    smsSent: smsResult,
    success: emailResult || smsResult
  };
}

/**
 * Generate COD Email HTML Template
 */
function generateCODEmailTemplate(order, user) {
  const items = order.items ? order.items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>₹${item.price}</td>
      <td>₹${item.quantity * item.price}</td>
    </tr>
  `).join('') : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #667eea; color: white; padding: 20px; text-align: center; }
        .section { margin: 20px 0; }
        .order-details { background-color: #f5f5f5; padding: 15px; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th { background-color: #667eea; color: white; padding: 10px; text-align: left; }
        td { padding: 10px; border-bottom: 1px solid #ddd; }
        .total { font-weight: bold; font-size: 18px; }
        .cod-badge { background-color: #ffc107; padding: 10px; border-radius: 5px; color: #333; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Order Confirmation</h1>
        </div>

        <div class="section">
          <h2>Hi ${user.name},</h2>
          <p>Thank you for your order! Your order has been confirmed and is ready for delivery.</p>
        </div>

        <div class="order-details">
          <h3>Order Details</h3>
          <p><strong>Order ID:</strong> #${order._id}</p>
          <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
          <p><strong>Payment Method:</strong> <span class="cod-badge">Cash on Delivery (COD)</span></p>
          <p><strong>Status:</strong> ${order.status}</p>
        </div>

        <div class="section">
          <h3>Items Ordered</h3>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${items}
            </tbody>
          </table>
        </div>

        <div class="order-details">
          <h3>Price Summary</h3>
          <p><strong>Subtotal:</strong> ₹${order.subtotal || order.total}</p>
          <p><strong>Tax:</strong> ₹${order.tax || 0}</p>
          <p><strong>Shipping:</strong> ₹${order.shipping || 0}</p>
          <p class="total"><strong>Total Amount:</strong> ₹${order.total}</p>
          <p style="color: #d32f2f; font-weight: bold;">📍 Pay ₹${order.total} to the delivery person on delivery</p>
        </div>

        <div class="section">
          <h3>Delivery Address</h3>
          <p>${order.shippingAddress?.address}<br>
             ${order.shippingAddress?.city}, ${order.shippingAddress?.state} ${order.shippingAddress?.pincode}<br>
             ${order.shippingAddress?.phone}</p>
        </div>

        <div class="section">
          <h3>⏱️ Estimated Delivery</h3>
          <p><strong>${new Date(order.estimatedDelivery || Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString()}</strong></p>
          <p>We'll notify you once your order is on the way.</p>
        </div>

        <div class="section">
          <h3>Need Help?</h3>
          <p>Contact us at <a href="mailto:support@ekbhavishya.com">support@ekbhavishya.com</a> or call us at +91-XXXX-XXX-XXX</p>
        </div>

        <div class="footer">
          <p>© 2026 Ek Bhavishya. All rights reserved.</p>
          <p>This is an automated email. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate COD SMS Template
 */
function generateCODSMSTemplate(order, user) {
  return `Hi ${user.name}, Your order #${order._id} is confirmed! 
Amount: ₹${order.total} (Pay on delivery)
Delivery by: ${new Date(order.estimatedDelivery || Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString()}
Track here: ekbhavishya.com/track/${order._id}`;
}
