import User from '../../../models/User.js';
import Astrologer from '../../../models/Astrologer.js';
import Seller from '../../../models/Seller.js';
import Product from '../../../models/Product.js';
import Blog from '../../../models/Blog.js';
import Remedy from '../../../models/Remedy.js';
import Course from '../../../models/Course.js';
import ChatSession from '../../../models/ChatSession.js';
import WalletTransaction from '../../../models/Transaction.js';
import LiveSession from '../../../models/LiveSession.js';
import CallSession from '../../../models/CallSession.js';
import Notification from '../../../models/Notification.js';
import { createNotification, broadcastNotification } from '../../../utils/notificationService.js';


const getDashboardStats = async (req, res) => {
  // ... existing code (unchanged)
  try {
    // Users: Total count
    const totalUsers = await User.countDocuments();

    // Astrologers: Total count
    const totalAstrologers = await Astrologer.countDocuments();

    // Sellers: Total count
    const totalSellers = await Seller.countDocuments();

    // New Products: Count products created in the last 15 days
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const newProductsCount = await Product.countDocuments({ createdAt: { $gte: fifteenDaysAgo } });

    // Monthly stats for last 3 months (including current partial month)
    const now = new Date();
    const months = [];
    for (let i = 2; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: date.getFullYear(),
        month: date.getMonth(),
        name: date.toLocaleString('default', { month: 'long' })
      });
    }

    const monthlyStats = [];
    for (const m of months) {
      const start = new Date(m.year, m.month, 1);
      const end = new Date(m.year, m.month + 1, 1);

      const users = await User.countDocuments({ createdAt: { $gte: start, $lt: end } });
      const astrologers = await Astrologer.countDocuments({ createdAt: { $gte: start, $lt: end } });
      const sellers = await Seller.countDocuments({ createdAt: { $gte: start, $lt: end } });
      const products = await Product.countDocuments({ createdAt: { $gte: start, $lt: end } });
      const verifiedProducts = await Product.countDocuments({
        createdAt: { $gte: start, $lt: end },
        is_verified: true
      });

      const revenueResult = await WalletTransaction.aggregate([
        { $match: { type: 'credit', createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const revenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

      monthlyStats.push({
        month: m.name,
        users,
        astrologers,
        sellers,
        products,
        verifiedProducts,
        revenue
      });
    }

    // Active Sessions: Count where status is 'active'
    const activeSessions = await ChatSession.countDocuments({ status: 'active' });

    // Revenue:Sum of all credit amounts in wallet transactions 
    const revenueResult = await WalletTransaction.aggregate([
      { $match: { type: 'credit' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    // Approvals: Count approved items
    const approvedBlogs = await Blog.countDocuments({ status: 'Approved' });
    const approvedRemedies = await Remedy.countDocuments({ status: 'Approved' });
    const approvedCourses = await Course.countDocuments({ status: 'Approved' });
    const approvedSellers = await Seller.countDocuments({ is_approved: true });
    const approvedAstrologers = await Astrologer.countDocuments({ is_approved: true });
    const approvedProducts = await Product.countDocuments({ is_verified: true });

    const totalApprovals = approvedBlogs + approvedRemedies + approvedCourses + approvedSellers + approvedAstrologers + approvedProducts;

    // Today stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const newUsersToday = await User.countDocuments({ createdAt: { $gte: todayStart, $lt: todayEnd } });
    const todayRevenueResult = await WalletTransaction.aggregate([
      { $match: { type: 'credit', createdAt: { $gte: todayStart, $lt: todayEnd } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const todayRevenue = todayRevenueResult.length > 0 ? todayRevenueResult[0].total : 0;

    // Pending stats
    const pendingAstrologers = await Astrologer.countDocuments({ isApproved: false });
    
    // Payout stats - Count pending payout requests
    const pendingPayouts = await WalletTransaction.countDocuments({ type: 'debit', referenceType: 'Withdrawal', status: 'pending' });

    // Last 7 days stats for graphs
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const revenueDataRaw = await WalletTransaction.aggregate([
      { $match: { type: 'credit', createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, total: { $sum: "$amount" } } },
      { $sort: { _id: 1 } }
    ]);

    const sessionsDataRaw = await ChatSession.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const revenueData = [];
    const sessionsData = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(sevenDaysAgo.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      
      const revMatch = revenueDataRaw.find(r => r._id === ds);
      revenueData.push(revMatch ? revMatch.total : 0);
      
      const sessMatch = sessionsDataRaw.find(s => s._id === ds);
      sessionsData.push(sessMatch ? sessMatch.count : 0);
    }

    // Recent Activities (Latest 10 notifications)
    const recentActivities = await Notification.find({ userId: null })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title body createdAt type');

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalAstrologers,
        totalSellers,
        monthlyStats,
        activeSessions,
        totalRevenue,
        todayRevenue,
        newUsersToday,
        pendingAstrologers,
        pendingPayouts,
        newProductsCount,
        revenueData,
        sessionsData,
        recentActivities,
        approvals: {
          total_approved: totalApprovals,
          details: {
            blogs: approvedBlogs,
            remedies: approvedRemedies,
            courses: approvedCourses,
            sellers: approvedSellers,
            astrologers: approvedAstrologers,
            products: approvedProducts
          }
        }
      }
    });
  } catch (error) {
    console.error('Get Dashboard Stats Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const getConsultationStats = async (req, res) => {
  // ... existing code (unchanged)
  try {
    let { startDate, endDate } = req.query;

    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date();
    if (!startDate) start.setDate(end.getDate() - 30);

    // Set to start/end of day for consistency
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    const bucketSize = Math.ceil(diffDays / 6);

    // 1. Fetch Total Counts in Period
    const [chatsCount, videosCount, callsCount] = await Promise.all([
      ChatSession.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      LiveSession.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      WalletTransaction.countDocuments({
        reason: 'call_session',
        createdAt: { $gte: start, $lte: end }
      })
    ]);

    // 2. Generate Graph Data (6 dynamic buckets)
    const graph = [];
    for (let i = 0; i < 6; i++) {
      const bStart = new Date(start);
      bStart.setDate(start.getDate() + (i * bucketSize));

      const bEnd = new Date(start);
      bEnd.setDate(start.getDate() + ((i + 1) * bucketSize));
      if (bEnd > end) bEnd.setTime(end.getTime()); // Don't overshoot

      const [bChats, bVideos, bCalls] = await Promise.all([
        ChatSession.countDocuments({ createdAt: { $gte: bStart, $lt: bEnd } }),
        LiveSession.countDocuments({ createdAt: { $gte: bStart, $lt: bEnd } }),
        WalletTransaction.countDocuments({
          reason: 'call_session',
          createdAt: { $gte: bStart, $lt: bEnd }
        })
      ]);

      graph.push({
        label: `${(i * bucketSize) + 1}-${Math.min((i + 1) * bucketSize, diffDays)}`,
        value: bChats + bVideos + bCalls
      });
    }

    res.status(200).json({
      success: true,
      data: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        periodStats: {
          calls: callsCount,
          chats: chatsCount,
          videos: videosCount
        },
        graph
      }
    });
  } catch (error) {
    console.error('Get Consultation Stats Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const getRevenueStats = async (req, res) => {
  // ... existing code (unchanged)
  try {
    let { startDate, endDate } = req.query;

    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date();
    if (!startDate) start.setDate(end.getDate() - 30);

    // Set to start/end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // 1. Calculate Current Revenue
    const [currentRevenueResult] = await Promise.all([
      WalletTransaction.aggregate([
        { $match: { type: 'credit', createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const currentRevenue = currentRevenueResult.length > 0 ? currentRevenueResult[0].total : 0;

    // 2. Generate Daily Revenue Graph (Optimized Single Query)
    const dailyRevenue = await WalletTransaction.aggregate([
      {
        $match: {
          type: 'credit',
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Create a map for quick lookup
    const revenueMap = new Map(dailyRevenue.map(item => [item._id, item.totalAmount]));

    // Compute inclusive day count (handles start > end)
    const msPerDay = 24 * 60 * 60 * 1000;
    const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const inclusiveDays = Math.floor(Math.abs(endDateOnly - startDateOnly) / msPerDay) + 1;

    // Iterate from the earlier date to the later date so the graph is chronological
    const iterateStart = startDateOnly <= endDateOnly ? startDateOnly : endDateOnly;

    const revenueGraph = [];
    for (let i = 0; i < inclusiveDays; i++) {
      const d = new Date(iterateStart);
      d.setDate(iterateStart.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      revenueGraph.push({
        date: dateStr,
        amount: revenueMap.get(dateStr) || 0
      });
    }

    res.status(200).json({
      success: true,
      data: {
        startDate: startDateOnly.toISOString().split('T')[0],
        endDate: endDateOnly.toISOString().split('T')[0],
        period: {
          days: inclusiveDays
        },
        periodStats: {
          totalRevenue: currentRevenue
        },
        revenueGraph
      }
    });
  } catch (error) {
    console.error('Get Revenue Stats Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const getUserAnalytics = async (req, res) => {
  // ... existing code (unchanged)
  try {
    const totalUsers = await User.countDocuments();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsersLast30Days = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        newUsersLast30Days
      }
    });
  } catch (error) {
    console.error('Get User Analytics Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const getEngagementStats = async (req, res) => {
  try {
    let { startDate, endDate } = req.query;
    const TIMEZONE = "+05:30";

    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date();

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const diffTime = Math.abs(end - start);
    const inclusiveDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Helper for local date string (YYYY-MM-DD)
    const toLocalDateString = (date) => {
      const offset = 5.5 * 60 * 60 * 1000;
      const localDate = new Date(date.getTime() + offset);
      return localDate.toISOString().split('T')[0];
    };

    // 1. Total Active Astrologers (Snapshot)
    const totalAstrologers = await Astrologer.countDocuments({ status: 'Approved' });
    const activeAstrologersCount = await Astrologer.countDocuments({
      status: 'Approved',
      'availability.status': { $in: ['online', 'busy'] }
    });

    // 2. Total Engagement Duration in Period
    const [callDurations, liveDurations, chatDurations] = await Promise.all([
      CallSession.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: 'ended' } },
        { $group: { _id: '$astrologerId', duration: { $sum: '$duration' } } }
      ]),
      LiveSession.aggregate([
        { $match: { actualStartTime: { $gte: start, $lte: end }, status: 'ended' } },
        { $group: { _id: '$astrologerId', duration: { $sum: { $multiply: ['$duration', 60] } } } }
      ]),
      ChatSession.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: 'ended' } },
        { $group: { _id: '$astrologerId', duration: { $sum: { $divide: [{ $subtract: ['$lastMessageAt', '$createdAt'] }, 1000] } } } }
      ])
    ]);

    const astrologerEngagement = new Map();
    const addDurations = (data) => data.forEach(item => {
      if (!item._id) return;
      astrologerEngagement.set(item._id.toString(), (astrologerEngagement.get(item._id.toString()) || 0) + item.duration);
    });
    addDurations(callDurations);
    addDurations(liveDurations);
    addDurations(chatDurations);

    let totalSeconds = 0;
    astrologerEngagement.forEach(dur => totalSeconds += dur);
    const totalHours = parseFloat((totalSeconds / 3600).toFixed(1));

    // 3. Top 3 Most Engaged Astrologers
    const sortedAstrologerIds = Array.from(astrologerEngagement.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topAstrologers = await Promise.all(sortedAstrologerIds.map(async ([id, duration], index) => {
      const astro = await Astrologer.findById(id).select('personalDetails.name personalDetails.profileImage');
      return {
        rank: index + 1,
        name: astro?.personalDetails?.name || 'Unknown',
        image: astro?.personalDetails?.profileImage || null,
        hours: parseFloat((duration / 3600).toFixed(1))
      };
    }));

    // 4. Cumulative Hourly Engagement Trend (Across all days in period)
    const bucketBranches = [
      { case: { $and: [{ $gte: ['$hour', 9] }, { $lt: ['$hour', 12] }] }, then: '9AM' },
      { case: { $and: [{ $gte: ['$hour', 12] }, { $lt: ['$hour', 15] }] }, then: '12PM' },
      { case: { $and: [{ $gte: ['$hour', 15] }, { $lt: ['$hour', 18] }] }, then: '3PM' },
      { case: { $and: [{ $gte: ['$hour', 18] }, { $lt: ['$hour', 21] }] }, then: '6PM' },
      { case: { $and: [{ $gte: ['$hour', 21] }, { $lt: ['$hour', 24] }] }, then: '9PM' }
    ];

    const [callTrend, liveTrend, chatTrend] = await Promise.all([
      CallSession.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: 'ended' } },
        { $project: { duration: '$duration', hour: { $hour: { date: '$createdAt', timezone: TIMEZONE } } } },
        { $addFields: { bucket: { $switch: { branches: bucketBranches, default: 'Other' } } } },
        { $group: { _id: '$bucket', total: { $sum: '$duration' } } }
      ]),
      LiveSession.aggregate([
        { $match: { actualStartTime: { $gte: start, $lte: end }, status: 'ended' } },
        { $project: { duration: { $multiply: ['$duration', 60] }, hour: { $hour: { date: '$actualStartTime', timezone: TIMEZONE } } } },
        { $addFields: { bucket: { $switch: { branches: bucketBranches, default: 'Other' } } } },
        { $group: { _id: '$bucket', total: { $sum: '$duration' } } }
      ]),
      ChatSession.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: 'ended' } },
        { $project: { duration: { $divide: [{ $subtract: ['$lastMessageAt', '$createdAt'] }, 1000] }, hour: { $hour: { date: '$createdAt', timezone: TIMEZONE } } } },
        { $addFields: { bucket: { $switch: { branches: bucketBranches, default: 'Other' } } } },
        { $group: { _id: '$bucket', total: { $sum: '$duration' } } }
      ])
    ]);

    const trendMap = new Map();
    const addTrend = (data) => data.forEach(item => {
      if (item._id === 'Other') return;
      trendMap.set(item._id, (trendMap.get(item._id) || 0) + item.total);
    });
    addTrend(callTrend);
    addTrend(liveTrend);
    addTrend(chatTrend);

    const labels = ['9AM', '12PM', '3PM', '6PM', '9PM'];
    const engagementTrend = labels.map(label => ({
      label,
      value: parseFloat(((trendMap.get(label) || 0) / 3600).toFixed(1))
    }));

    res.status(200).json({
      success: true,
      data: {
        period: {
          start: toLocalDateString(start),
          end: toLocalDateString(end),
          days: inclusiveDays
        },
        activeAstrologers: {
          active: activeAstrologersCount,
          total: totalAstrologers,
          rate: totalAstrologers > 0 ? Math.round((activeAstrologersCount / totalAstrologers) * 100) : 0
        },
        engagementHours: {
          totalHours: totalHours,
          avgPerDay: inclusiveDays > 0 ? parseFloat((totalHours / inclusiveDays).toFixed(1)) : totalHours,
          avgPerAstrologer: activeAstrologersCount > 0 ? parseFloat((totalHours / activeAstrologersCount).toFixed(1)) : 0
        },
        topEngagedAstrologers: topAstrologers,
        engagementTrend
      }
    });

  } catch (error) {
    console.error('Get Engagement Stats Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

const dashboardController = {
  getDashboardStats,
  getConsultationStats,
  getRevenueStats,
  getUserAnalytics,
  getEngagementStats,
  getAnalytics: async (req, res) => {
    try {
      const { period = '7D' } = req.query;
      const days = period === '7D' ? 7 : period === '30D' ? 30 : 90;
      const start = new Date();
      start.setDate(start.getDate() - days);

      const revenueDataRaw = await WalletTransaction.aggregate([
        { $match: { type: 'credit', createdAt: { $gte: start } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, total: { $sum: "$amount" } } },
        { $sort: { _id: 1 } }
      ]);

      const revenueTrend = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const ds = d.toISOString().split('T')[0];
        const match = revenueDataRaw.find(r => r._id === ds);
        revenueTrend.push(match ? match.total : 0);
      }

      const topAstrologers = await WalletTransaction.aggregate([
        { $match: { type: 'credit' } },
        { $group: { _id: "$astrologerId", revenue: { $sum: "$amount" } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'astrologers', localField: '_id', foreignField: '_id', as: 'astro' } },
        { $unwind: "$astro" },
        { $project: { name: "$astro.personalDetails.name", revenue: 1 } }
      ]);

      const userGrowthRaw = await User.aggregate([
        { $group: { _id: { $month: "$createdAt" }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);
      const userGrowth = Array(12).fill(0);
      userGrowthRaw.forEach(u => userGrowth[u._id - 1] = u.count);

      // Session Stats
      const [chatCount, callCount, videoCount] = await Promise.all([
        ChatSession.countDocuments({ createdAt: { $gte: start } }),
        WalletTransaction.countDocuments({ reason: 'call_session', createdAt: { $gte: start } }),
        LiveSession.countDocuments({ createdAt: { $gte: start } })
      ]);

      const totalUsers = await User.countDocuments();
      const today = new Date();
      today.setHours(0,0,0,0);
      const newUsersToday = await User.countDocuments({ createdAt: { $gte: today } });

      res.status(200).json({
        success: true,
        data: {
          revenueData: { [period]: revenueTrend },
          topAstrologers,
          userGrowth,
          sessionDistribution: {
            chat: chatCount,
            call: callCount,
            video: videoCount,
            total: chatCount + callCount + videoCount
          },
          userStats: {
            total: totalUsers,
            today: newUsersToday
          },
          sessionTrend: [chatCount, callCount, videoCount, (chatCount + callCount + videoCount) / 2, chatCount, callCount, videoCount] // Mock trend for now or calculate real daily trend
        }
      });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  sendNotification: async (req, res) => {
    try {
      const { title, body, target, targetId } = req.body;
      
      let sentCount = 0;
      let result;

      if (targetId) {
        // Send to specific user
        await createNotification({
          userId: targetId,
          title,
          body,
          type: 'general'
        });
        sentCount = 1;
      } else {
        // Broadcast
        result = await broadcastNotification(target, title, body);
        sentCount = result.count;
      }

      const notification = await Notification.create({
        title,
        body,
        target: targetId ? `specific (${target})` : target,
        targetId,
        sentCount,
        sentAt: new Date()
      });

      res.status(200).json({ success: true, message: 'Notification sent successfully', data: notification });
    } catch (e) {
      console.error('Send Notification Error:', e);
      res.status(500).json({ success: false, message: e.message });
    }
  }
};

export default dashboardController;
