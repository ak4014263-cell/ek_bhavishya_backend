import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Utility to send emails via Resend
 * @param {Object} options - { email, subject, message, html }
 */
const sendEmail = async (options) => {
    if (!process.env.RESEND_API_KEY) {
        console.error("❌ Email sending failed: RESEND_API_KEY is not defined.");
        return { success: false, error: 'RESEND_API_KEY missing' };
    }

    try {
        const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
        const { data, error } = await resend.emails.send({
            from,
            to: options.email,
            subject: options.subject,
            text: options.message,
            html: options.html || `<p>${options.message}</p>`,
        });

        if (error) {
            console.error("❌ Email sending failed via Resend:", error);
            return { success: false, error };
        }

        console.log("✅ Email sent via Resend: " + (data?.id || 'Success'));
        return { success: true, data };
    } catch (error) {
        console.error("❌ Email sending failed:", error);
        return { success: false, error: error.message };
    }
};

export default sendEmail;