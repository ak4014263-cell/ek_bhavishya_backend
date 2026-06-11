import User from '../../../models/User.js';
import mongoose from 'mongoose';

const blockUser = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

    const user = await User.findByIdAndUpdate(id, { status: 'Blocked' }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    res.status(200).json({ success: true, message: 'User blocked successfully.', user });
  } catch (error) {
    console.error('Block User Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const unblockUser = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

    const user = await User.findByIdAndUpdate(id, { status: 'Active' }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    res.status(200).json({ success: true, message: 'User unblocked successfully.', user });
  } catch (error) {
    console.error('Unblock User Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const editUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phoneNumber, status, dob, gender, birthPlace, birthTime } = req.body;

    if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Update personal information
    if (name !== undefined) user.fullName = name;
    if (email !== undefined) user.email = email;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (status !== undefined) user.status = status;
    if (dob !== undefined) user.dob = dob;
    if (gender !== undefined) user.gender = gender;
    if (birthPlace !== undefined) user.birthPlace = birthPlace;
    if (birthTime !== undefined) user.birthTime = birthTime;

    // Handle profile photo upload
    if (req.file) {
      user.profilePhoto = req.file.path;
    }

    const updatedUser = await user.save();

    res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      user: updatedUser
    });
  } catch (error) {
    console.error('Edit User Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully.',
      user
    });
  } catch (error) {
    console.error('Delete User Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.aggregate([
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $skip: parseInt(skip) },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'chatsessions',
          localField: '_id',
          foreignField: 'userId',
          as: 'chats'
        }
      },
      {
        $project: {
          _id: 1,
          name: '$fullName',
          email: '$email',
          phoneNumber: '$phoneNumber',
          status: '$status',
          wallet: { $ifNull: ['$walletBalance', 0] },
          isActive: { $eq: ['$status', 'Active'] },
          sessions: { $size: '$chats' }
        }
      }
    ]);

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      },
      data: users
    });
  } catch (error) {
    console.error('Get All Users Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const getUserActivityStats = async (req, res) => {
  try {
    let { startDate, endDate } = req.query;

    const getStatsInRange = async (start, end) => {
      const query = { createdAt: { $gte: start, $lte: end } };

      const newUsers = await User.countDocuments(query);

      const [activeChats, activeCalls, activeLive, activeWallet] = await Promise.all([
        mongoose.model('ChatSession').distinct('userId', query),
        mongoose.model('CallSession').distinct('userId', query),
        mongoose.model('LiveSession').distinct('userId', {
          $or: [
            { createdAt: { $gte: start, $lte: end } },
            { 'activeViewers.joinedAt': { $gte: start, $lte: end } },
            { 'messages.timestamp': { $gte: start, $lte: end } }
          ]
        }),
        mongoose.model('UserWalletTransaction').distinct('userId', query)
      ]);

      const allActiveUserIds = new Set([
        ...activeChats.map(id => id.toString()),
        ...activeCalls.map(id => id.toString()),
        ...activeLive.map(id => id.toString()),
        ...activeWallet.map(id => id.toString())
      ]);

      return { newUsers, activeUsers: allActiveUserIds.size };
    };

    let globalStart, globalEnd;

    if (startDate && endDate) {
      globalStart = new Date(startDate);
      globalStart.setHours(0, 0, 0, 0);
      globalEnd = new Date(endDate);
      globalEnd.setHours(23, 59, 59, 999);
    } else {
      const now = new Date();
      globalEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      globalEnd.setHours(23, 59, 59, 999);
      globalStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      globalStart.setHours(0, 0, 0, 0);
    }

    const monthlyStats = [];
    let current = new Date(globalStart.getFullYear(), globalStart.getMonth(), 1);

    while (current <= globalEnd) {
      const monthStart = new Date(Math.max(globalStart, current));
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);
      const actualEnd = new Date(Math.min(globalEnd, monthEnd));

      const stats = await getStatsInRange(monthStart, actualEnd);
      monthlyStats.push({
        month: current.toLocaleString('default', { month: 'long' }),
        year: current.getFullYear(),
        newUsers: stats.newUsers,
        activeUsers: stats.activeUsers
      });

      current.setMonth(current.getMonth() + 1);
    }

    res.status(200).json({ success: true, data: monthlyStats });
  } catch (error) {
    console.error('User Activity Stats Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const newStatus = user.status === 'Active' ? 'Blocked' : 'Active';
    const updatedUser = await User.findByIdAndUpdate(id, { status: newStatus }, { new: true });

    res.status(200).json({ success: true, message: `User ${newStatus.toLowerCase()} successfully.`, user: updatedUser });
  } catch (error) {
    console.error('Toggle User Status Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const createUser = async (req, res) => {
  try {
    const { name, fullName, email, phoneNumber, password, role } = req.body;
    const finalName = name || fullName;
    
    if (!finalName || !email || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'Missing required fields (name, email, phone)' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phoneNumber }] });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email or phone' });
    }

    const user = await User.create({
      fullName: finalName,
      email,
      phoneNumber,
      password: password || 'Welcome@123',
      role: role || 'user',
      status: 'Active'
    });

    res.status(201).json({ success: true, message: 'User created successfully', user });
  } catch (error) {
    console.error('Create User Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};

const getUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: 'ID is required' });

    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error('Get User Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const userController = {
  blockUser,
  unblockUser,
  toggleUserStatus,
  editUser,
  deleteUser,
  getUserActivityStats,
  getAllUsers,
  getUser,
  createUser
};

export default userController;
