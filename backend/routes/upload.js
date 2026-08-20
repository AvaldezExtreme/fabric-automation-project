import express from 'express';
import { parseExcelBuffer, extractNetworkData, buildTopology } from '../services/excelParser.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { filename, data } = req.body;

    if (!filename || !data) {
      return res.status(400).json({ error: 'Missing filename or data' });
    }

    // Sanitize filename - remove path traversal attempts
    const sanitized = filename.replace(/\.\./g, '').replace(/[\/\\]/g, '');
    if (!sanitized || sanitized.length > 255) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Validate file type (Excel only)
    const allowedExts = ['.xlsx', '.xls', '.xlsm'];
    const ext = sanitized.toLowerCase().substring(sanitized.lastIndexOf('.'));
    if (!allowedExts.includes(ext)) {
      return res.status(400).json({ error: 'Only Excel files (.xlsx, .xls, .xlsm) are supported' });
    }

    // Decode base64 and parse in memory - no disk writes needed
    const buffer = Buffer.from(data, 'base64');
    const excelSheets = parseExcelBuffer(buffer);

    const switches = extractNetworkData(excelSheets);

    if (switches.length === 0) {
      return res.status(400).json({ error: 'No switch data found in Excel file' });
    }

    const topology = buildTopology(switches);

    res.json({
      success: true,
      data: {
        switches,
        topology,
        sheetNames: Object.keys(excelSheets),
        switchCount: switches.length,
        vlanCount: switches.reduce((sum, sw) => sum + (sw.vlans?.length || 0), 0)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    // Log the real cause server-side so deploy logs are actionable
    console.error(`[upload] ${error.message}`);
    res.status(400).json({
      error: 'Failed to process file',
      code: 'UPLOAD_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
