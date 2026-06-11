import Settings from '../models/Settings.js';

export const checkMaintenanceMode = async (req, res, next) => {
    const url = req.originalUrl || req.url || '';

    // Exempt config, health, admin, and all login/register endpoints
    if (
        url.includes('/api/config') ||
        url.includes('/health') ||
        url.startsWith('/api/v1/admin') ||
        url.startsWith('/api/auth') ||
        /\/(login|register)(\?|$|\/)/i.test(url)
    ) {
        return next();
    }

    try {
        const settings = await Settings.findOne();
        if (settings && settings.maintenanceMode) {
            return res.status(503).json({
                success: false,
                message: 'Service is currently under maintenance. Please try again later.'
            });
        }
    } catch (error) {
        console.error('Maintenance mode check error:', error);
    }
    
    next();
};
