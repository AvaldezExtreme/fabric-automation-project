// ============================================
// Validation Routes
// Version: V2608173
// Purpose: Configuration validation endpoints
// ============================================

import express from 'express';
import { validateFabricConfiguration } from '../services/fabricValidator.js';

const router = express.Router();

// POST /api/validate/fabric
// Validate Fabric configuration
router.post('/fabric', (req, res) => {
  try {
    const { switches, settings = {} } = req.body;

    if (!switches || !Array.isArray(switches)) {
      return res.status(400).json({
        error: 'Invalid request: switches must be an array'
      });
    }

    const validationResults = validateFabricConfiguration(switches, settings);

    res.json({
      success: true,
      data: validationResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      error: 'Validation failed',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/validate/status
// Health check for validator
router.get('/status', (req, res) => {
  res.json({
    status: 'ready',
    validator: 'Fabric Configuration Validator',
    version: 'V2608173',
    checks: [
      'IP Subnet Validation',
      'VLAN Configuration',
      'I-SID Uniqueness',
      'Fabric Features',
      'DHCP Configuration',
      'Interface Configuration'
    ],
    timestamp: new Date().toISOString()
  });
});

export default router;
