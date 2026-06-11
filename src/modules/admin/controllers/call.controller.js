import CallSession from '../../../models/CallSession.js';
import Astrologer from '../../../models/Astrologer.js';
import User from '../../../models/User.js';

/**
 * Get all active calls for admin monitoring
 * Requirements: 12.3
 */
const getActiveCalls = async (req, res) => {
  try {
    const activeCalls = await CallSession.find({
      status: { $in: ['ringing', 'connecting', 'active'] }
    })
      .populate('userId', 'name email phone')
      .populate('astrologerId', 'name email phone')
      .sort({ initiatedAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: activeCalls.length,
      calls: activeCalls
    });
  } catch (error) {
    console.error('Get Active Calls Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active calls',
      error: error.message
    });
  }
};

/**
 * Get call statistics for admin dashboard
 * Requirements: 12.3
 */
const getCallStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.initiatedAt = {};
      if (startDate) dateFilter.initiatedAt.$gte = new Date(startDate);
      if (endDate) dateFilter.initiatedAt.$lte = new Date(endDate);
    }

    // Get overall statistics
    const [
      totalCalls,
      activeCalls,
      completedCalls,
      rejectedCalls,
      cancelledCalls,
      reportedCalls,
      revenueStats
    ] = await Promise.all([
      CallSession.countDocuments(dateFilter),
      CallSession.countDocuments({ ...dateFilter, status: 'active' }),
      CallSession.countDocuments({ ...dateFilter, status: 'ended' }),
      CallSession.countDocuments({ ...dateFilter, status: { $in: ['rejected', 'no_answer'] } }),
      CallSession.countDocuments({ ...dateFilter, status: 'cancelled' }),
      CallSession.countDocuments({ ...dateFilter, reportedBy: { $exists: true } }),
      CallSession.aggregate([
        { $match: { ...dateFilter, status: 'ended' } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            totalCommission: { $sum: '$platformCommission' },
            totalAstrologerEarnings: { $sum: '$astrologerEarnings' },
            averageCallDuration: { $avg: '$duration' },
            averageBilledAmount: { $avg: '$totalAmount' }
          }
        }
      ])
    ]);

    // Calculate acceptance rate
    const acceptanceRate = totalCalls > 0 
      ? ((completedCalls / totalCalls) * 100).toFixed(2)
      : 0;

    // Get call type breakdown
    const callTypeBreakdown = await CallSession.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$callType',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get billing type breakdown
    const billingTypeBreakdown = await CallSession.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$billingType',
          count: { $sum: 1 }
        }
      }
    ]);

    const revenue = revenueStats[0] || {
      totalRevenue: 0,
      totalCommission: 0,
      totalAstrologerEarnings: 0,
      averageCallDuration: 0,
      averageBilledAmount: 0
    };

    res.status(200).json({
      success: true,
      statistics: {
        totalCalls,
        activeCalls,
        completedCalls,
        rejectedCalls,
        cancelledCalls,
        reportedCalls,
        acceptanceRate: parseFloat(acceptanceRate),
        revenue: {
          total: revenue.totalRevenue,
          commission: revenue.totalCommission,
          astrologerEarnings: revenue.totalAstrologerEarnings,
          averagePerCall: revenue.averageBilledAmount
        },
        averageCallDuration: Math.round(revenue.averageCallDuration || 0),
        callTypeBreakdown,
        billingTypeBreakdown
      }
    });
  } catch (error) {
    console.error('Get Call Statistics Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call statistics',
      error: error.message
    });
  }
};

/**
 * Get all reported calls for admin review
 * Requirements: 12.3
 */
const getReportedCalls = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = { reportedBy: { $exists: true } };
    if (status) {
      filter.status = status;
    }

    const [reportedCalls, totalCount] = await Promise.all([
      CallSession.find(filter)
        .populate('userId', 'name email phone')
        .populate('astrologerId', 'name email phone')
        .populate('reportedBy', 'name email')
        .sort({ reportedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      CallSession.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      count: reportedCalls.length,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
      calls: reportedCalls
    });
  } catch (error) {
    console.error('Get Reported Calls Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reported calls',
      error: error.message
    });
  }
};

const callController = {
  getActiveCalls,
  getCallStatistics,
  getReportedCalls
};

export default callController;

/**
 * Get detailed report information for a specific call
 * Requirements: 12.5
 */
const getReportDetails = async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await CallSession.findById(callId)
      .populate('userId', 'name email phone')
      .populate('astrologerId', 'name email phone')
      .populate('reportedBy', 'name email')
      .lean();

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    if (!call.reportedBy) {
      return res.status(400).json({
        success: false,
        message: 'This call has not been reported'
      });
    }

    res.status(200).json({
      success: true,
      call
    });
  } catch (error) {
    console.error('Get Report Details Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report details',
      error: error.message
    });
  }
};

/**
 * Take action on a reported call - refund user
 * Requirements: 12.5
 */
const refundReportedCall = async (req, res) => {
  try {
    const { callId } = req.params;
    const { refundAmount, adminNotes } = req.body;

    const call = await CallSession.findById(callId);

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    if (!call.reportedBy) {
      return res.status(400).json({
        success: false,
        message: 'This call has not been reported'
      });
    }

    // Calculate refund amount if not provided
    const finalRefundAmount = refundAmount || call.totalAmount;

    // Update call with admin action
    call.adminAction = {
      type: 'refund',
      amount: finalRefundAmount,
      notes: adminNotes,
      processedAt: new Date(),
      processedBy: req.admin.id
    };

    await call.save();

    // Note: Actual wallet refund should be handled by wallet service
    // This is just recording the admin decision

    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      call
    });
  } catch (error) {
    console.error('Refund Reported Call Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund',
      error: error.message
    });
  }
};

/**
 * Dismiss a report without taking action
 * Requirements: 12.5
 */
const dismissReport = async (req, res) => {
  try {
    const { callId } = req.params;
    const { adminNotes } = req.body;

    const call = await CallSession.findById(callId);

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    if (!call.reportedBy) {
      return res.status(400).json({
        success: false,
        message: 'This call has not been reported'
      });
    }

    // Update call with admin action
    call.adminAction = {
      type: 'dismissed',
      notes: adminNotes,
      processedAt: new Date(),
      processedBy: req.admin.id
    };

    await call.save();

    res.status(200).json({
      success: true,
      message: 'Report dismissed successfully',
      call
    });
  } catch (error) {
    console.error('Dismiss Report Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to dismiss report',
      error: error.message
    });
  }
};

callController.getReportDetails = getReportDetails;
callController.refundReportedCall = refundReportedCall;
callController.dismissReport = dismissReport;

/**
 * Suspend astrologer due to reported call issues
 * Requirements: 12.5
 */
const suspendAstrologerForCallIssues = async (req, res) => {
  try {
    const { astrologerId } = req.params;
    const { suspensionReason, callId, suspensionDuration, adminNotes } = req.body;

    if (!suspensionReason) {
      return res.status(400).json({
        success: false,
        message: 'Suspension reason is required'
      });
    }

    // Find the astrologer
    const astrologer = await Astrologer.findById(astrologerId);

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: 'Astrologer not found'
      });
    }

    // Check if there's an active call
    const activeCall = await CallSession.findOne({
      astrologerId,
      status: { $in: ['ringing', 'connecting', 'active'] }
    });

    if (activeCall) {
      return res.status(400).json({
        success: false,
        message: 'Cannot suspend astrologer with active call. Please end the call first.'
      });
    }

    // Update astrologer status
    astrologer.status = 'Suspended';
    astrologer.suspensionReason = suspensionReason;
    astrologer.suspendedAt = new Date();
    astrologer.suspendedBy = req.admin.id;
    
    // Set availability to offline
    if (astrologer.availability) {
      astrologer.availability.status = 'offline';
    }

    // Set suspension duration if provided (in days)
    if (suspensionDuration) {
      const suspensionEndDate = new Date();
      suspensionEndDate.setDate(suspensionEndDate.getDate() + suspensionDuration);
      astrologer.suspensionEndsAt = suspensionEndDate;
    }

    await astrologer.save();

    // If related to a specific call, update the call record
    if (callId) {
      await CallSession.findByIdAndUpdate(callId, {
        'adminAction.type': 'astrologer_suspended',
        'adminAction.notes': adminNotes,
        'adminAction.processedAt': new Date(),
        'adminAction.processedBy': req.admin.id
      });
    }

    // Note: Notification should be sent to astrologer
    // This would typically be handled by a notification service

    res.status(200).json({
      success: true,
      message: 'Astrologer suspended successfully',
      astrologer: {
        id: astrologer._id,
        name: astrologer.name,
        status: astrologer.status,
        suspensionReason: astrologer.suspensionReason,
        suspendedAt: astrologer.suspendedAt,
        suspensionEndsAt: astrologer.suspensionEndsAt
      }
    });
  } catch (error) {
    console.error('Suspend Astrologer For Call Issues Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suspend astrologer',
      error: error.message
    });
  }
};

/**
 * Unsuspend an astrologer
 * Requirements: 12.5
 */
const unsuspendAstrologer = async (req, res) => {
  try {
    const { astrologerId } = req.params;
    const { adminNotes } = req.body;

    const astrologer = await Astrologer.findById(astrologerId);

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: 'Astrologer not found'
      });
    }

    if (astrologer.status !== 'Suspended') {
      return res.status(400).json({
        success: false,
        message: 'Astrologer is not suspended'
      });
    }

    // Update astrologer status
    astrologer.status = 'Approved';
    astrologer.unsuspendedAt = new Date();
    astrologer.unsuspendedBy = req.admin.id;
    astrologer.unsuspensionNotes = adminNotes;
    
    // Clear suspension fields
    astrologer.suspensionEndsAt = undefined;

    await astrologer.save();

    // Note: Notification should be sent to astrologer
    // This would typically be handled by a notification service

    res.status(200).json({
      success: true,
      message: 'Astrologer unsuspended successfully',
      astrologer: {
        id: astrologer._id,
        name: astrologer.name,
        status: astrologer.status,
        unsuspendedAt: astrologer.unsuspendedAt
      }
    });
  } catch (error) {
    console.error('Unsuspend Astrologer Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unsuspend astrologer',
      error: error.message
    });
  }
};

/**
 * Get suspension history for an astrologer
 * Requirements: 12.5
 */
const getAstrologerSuspensionHistory = async (req, res) => {
  try {
    const { astrologerId } = req.params;

    const astrologer = await Astrologer.findById(astrologerId)
      .select('name email status suspensionReason suspendedAt suspensionEndsAt')
      .lean();

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: 'Astrologer not found'
      });
    }

    // Get all reported calls for this astrologer
    const reportedCalls = await CallSession.find({
      astrologerId,
      reportedBy: { $exists: true }
    })
      .populate('reportedBy', 'name email')
      .select('reportReason reportedAt status adminAction')
      .sort({ reportedAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      astrologer,
      reportedCallsCount: reportedCalls.length,
      reportedCalls
    });
  } catch (error) {
    console.error('Get Astrologer Suspension History Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch suspension history',
      error: error.message
    });
  }
};

callController.suspendAstrologerForCallIssues = suspendAstrologerForCallIssues;
callController.unsuspendAstrologer = unsuspendAstrologer;
callController.getAstrologerSuspensionHistory = getAstrologerSuspensionHistory;
