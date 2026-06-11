import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
    siteName: { type: String, default: 'Ek Bhavishya' },
    siteEmail: { type: String, default: 'contact@ekbhavishya.com' },
    contactNumber: { type: String, default: '+91 9999999999' },
    currency: { type: String, default: 'INR' },
    maintenanceMode: { type: Boolean, default: false },
    newRegistrations: { type: Boolean, default: true },
    autoApproveAstrologers: { type: Boolean, default: false },
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    platformCommission: { type: Number, default: 20 },
    minPayoutAmount: { type: Number, default: 500 },
    apiUrl: { type: String, default: '' },
    supportEmail: { type: String, default: 'support@ekbhavishya.com' },
    appVersion: { type: String, default: '1.0.0' },
}, { timestamps: true });

const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
export default Settings;
