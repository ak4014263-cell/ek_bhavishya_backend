/**
 * Metrics Controller
 * Provides endpoints for viewing call session metrics
 */

import metricsCollector from '../../../utils/metricsCollector.js';

/**
 * Get current metrics snapshot
 */
export const getCurrentMetrics = async (req, res) => {
    try {
        const metrics = metricsCollector.getMetrics();
        
        res.status(200).json({
            success: true,
            data: metrics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve metrics',
            error: error.message
        });
    }
};

/**
 * Get historical metrics
 */
export const getHistoricalMetrics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const options = {};
        if (startDate) options.startDate = new Date(startDate);
        if (endDate) options.endDate = new Date(endDate);
        
        const metrics = await metricsCollector.getHistoricalMetrics(options);
        
        res.status(200).json({
            success: true,
            data: metrics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve historical metrics',
            error: error.message
        });
    }
};

/**
 * Log metrics summary
 */
export const logMetricsSummary = async (req, res) => {
    try {
        metricsCollector.logMetricsSummary();
        
        res.status(200).json({
            success: true,
            message: 'Metrics summary logged successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to log metrics summary',
            error: error.message
        });
    }
};

export default {
    getCurrentMetrics,
    getHistoricalMetrics,
    logMetricsSummary
};
