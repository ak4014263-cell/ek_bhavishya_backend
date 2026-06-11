import Admin from '../models/admin.model.js';
import jwt from 'jsonwebtoken';
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      console.warn(`Login attempt failed: Admin with email '${email}' not found.`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user has admin role
    if (!admin.role || admin.role !== 'admin') {
      console.warn(`Login attempt failed: User '${email}' does not have admin role. Role: ${admin.role}`);
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      console.warn(`Login attempt failed: Invalid password for admin '${email}'.`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const payload = { id: admin._id, email: admin.email, role: admin.role };
    const secret = process.env.JWT_SECRET;
    const issuer = process.env.JWT_TOKEN_ISSUER || 'astrology_app';

    const token = jwt.sign(payload, secret, { issuer, expiresIn: '30d' });

    res.status(200).json({ 
      success: true,
      token, 
      admin: { 
        id: admin._id, 
        email: admin.email, 
        name: admin.name,
        role: admin.role 
      } 
    });
  } catch (error) {
    console.error('Admin Login Error:', error);
    res.status(500).json({ message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { name, email, password } = req.body;
    
    const admin = await Admin.findById(adminId);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

    if (name) admin.name = name;
    if (email) admin.email = email;
    if (password) admin.password = password;

    await admin.save();
    res.json({ success: true, message: 'Profile updated successfully', admin: { id: admin._id, name: admin.name, email: admin.email } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resetSettings = async (req, res) => {
  try {
    const Settings = (await import('../../../models/Settings.js')).default;
    await Settings.deleteMany({});
    const newSettings = await Settings.create({});
    res.json({ success: true, message: 'Settings reset to default', settings: newSettings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDeletionRequests = async (req, res) => {
  try {
    const User = (await import('../../../models/User.js')).default;
    const users = await User.find({ deleteRequested: true }).select('fullName email phoneNumber role deleteRequested deleteRequestedAt isDeleted');
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const approveDeletionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const User = (await import('../../../models/User.js')).default;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isDeleted = true;
    user.status = 'Blocked'; // Also block them just to be doubly safe
    await user.save();

    // If they are an astrologer, suspend the astrologer profile
    if (user.role === 'astrologer') {
      const Astrologer = (await import('../../../models/Astrologer.js')).default;
      await Astrologer.findOneAndUpdate({ userId: user._id }, { 'systemStatus.isApproved': false, status: 'Suspended' });
    }

    // If they are a seller, deactivate the seller profile
    if (user.role === 'seller') {
      const Seller = (await import('../../../models/Seller.js')).default;
      await Seller.findOneAndUpdate({ userId: user._id }, { is_approved: false, status: 'Inactive' });
    }

    res.json({ success: true, message: 'Account deletion request approved and account deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const rejectDeletionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const User = (await import('../../../models/User.js')).default;
    const user = await User.findByIdAndUpdate(id, { deleteRequested: false, deleteRequestedAt: null }, { new: true });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'Account deletion request rejected successfully.', user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminControllers = {
  login,
  updateProfile,
  resetSettings,
  getDeletionRequests,
  approveDeletionRequest,
  rejectDeletionRequest
};

export default adminControllers;
