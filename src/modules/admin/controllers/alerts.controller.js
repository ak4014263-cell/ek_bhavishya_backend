/**
 * Alerts Controller
 * Provides endpoints for managing alerts and monitoring
 */

import alertManager from '../../../utils/alertManager.js';

/**
 * Get alert configuration
 */
export const getAlertConfiguration = async (req, res) => {
    try {
        const config = alertManager.getConfiguration();
        
        res.status(200).json({
            success: true,
            data: config
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve alert configuration',
            error: error.message
        });
    }
};

/**
 * Update alert thresholds
 */
export const updateAlertThresholds = async (req, res) => {
    try {
        const { callFailureRate, billingErrorRate, agoraErrorRate, databaseErrorRate } = req.body;
        
        const newThresholds = {};
        if (callFailureRate !== undefined) newThresholds.callFailureRate = callFailureRate;
        if (billingErrorRate !== undefined) newThresholds.billingErrorRate = billingErrorRate;
        if (agoraErrorRate !== undefined) newThresholds.agoraErrorRate = agoraErrorRate;
        if (databaseErrorRate !== undefined) newThresholds.databaseErrorRate = databaseErrorRate;
        
        alertManager.updateThresholds(newThresholds);
        
        res.status(200).json({
            success: true,
            message: 'Alert thresholds updated successfully',
            data: alertManager.getConfiguration()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update alert thresholds',
            error: error.message
        });
    }
};

/**
 * Manually trigger alert check
 */
export const triggerManualCheck = async (req, res) => {
    try {
        alertManager.manualCheck();
        
        res.status(200).json({
            success: true,
            message: 'Manual alert check triggered successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to trigger manual check',
            error: error.message
        });
    }
};

export default {
    getAlertConfiguration,
    updateAlertThresholds,
    triggerManualCheck
};
