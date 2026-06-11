import express from 'express';
import Settings from '../models/Settings.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const settings = await Settings.findOne();
    res.json({
      success: true,
      data: {
        maintenanceMode: settings?.maintenanceMode || false,
        supportEmail: settings?.supportEmail || '',
        newRegistrations: settings?.newRegistrations !== false, // Default to true
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
