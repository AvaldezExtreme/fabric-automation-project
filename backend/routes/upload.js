import express from 'express';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { parseExcelFile, extractNetworkData, buildTopology } from '../services/excelParser.js';

const router = express.Router();

router.post('/', async (req, res) => {
  let filePath;

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

    // Decode base64 and write to disk
    const buffer = Buffer.from(data, 'base64');
    filePath = join('./backend/uploads', `${uuidv4()}_${sanitized}`);
    writeFileSync(filePath, buffer);
    
    // Parse Excel
    const excelSheets = parseExcelFile(filePath);

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
    res.status(400).json({
      error: 'Failed to process file',
      code: 'UPLOAD_ERROR',
      timestamp: new Date().toISOString()
    });
  } finally {
    if (filePath) {
      try {
        unlinkSync(filePath);
      } catch (err) {
        // Fail silently if temp file cleanup fails
      }
    }
  }
});

export default router;