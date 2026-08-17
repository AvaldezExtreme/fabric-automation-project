import express from 'express';
import { generateL2Config, generateL3Config } from '../services/configGenerator.js';
import { generateSiteEngineCsv } from '../services/csvGenerator.js';
import { generateXIQSEConfigs } from '../services/xiqseConfigGenerator.js';
import { generateMgmtCsv } from '../services/Mgmtcsvgenerator.js';
import { sanitizeFileName } from '../middleware/validation.js';

const router = express.Router();

router.post('/configs', (req, res) => {
  try {
    const { switches, settings = {} } = req.body;
    
    if (!switches || !Array.isArray(switches) || switches.length === 0) {
      return res.status(400).json({ error: 'No switches provided' });
    }
    
    const configs = {};
    
    switches.forEach(sw => {
      try {
        const fileName = sanitizeFileName(sw.name);
        
        if (sw.type === 'L3') {
          configs[fileName] = {
            filename: `${fileName}_L3_config.txt`,
            content: generateL3Config(sw, settings),
            type: 'L3'
          };
        } else {
          configs[fileName] = {
            filename: `${fileName}_L2_config.txt`,
            content: generateL2Config(sw, settings),
            type: 'L2'
          };
        }
      } catch (error) {
        configs[fileName] = {
          error: 'Failed to generate configuration'
        };
      }
    });
    
    res.json({
      success: true,
      configs,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate configurations',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/csv', (req, res) => {
  try {
    const { switches, serialMap = {} } = req.body;
    
    if (!switches || !Array.isArray(switches) || switches.length === 0) {
      return res.status(400).json({ error: 'No switches provided' });
    }
    
    const csv = generateSiteEngineCsv(switches, serialMap);
    
    res.json({
      success: true,
      filename: 'SCS-Serials.csv',
      content: csv,
      recordCount: switches.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate CSV',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/all', (req, res) => {
  try {
    const { switches, serialMap = {}, settings = {}, skipSerials = false, districtName = 'District' } = req.body;
    
    if (!switches || !Array.isArray(switches) || switches.length === 0) {
      return res.status(400).json({ error: 'No switches provided' });
    }
    
    // Generate L2/L3 configs
    const configs = {};
    switches.forEach(sw => {
      try {
        const fileName = sanitizeFileName(sw.name);
        if (sw.type === 'L3') {
          configs[fileName] = {
            filename: `${fileName}_L3_config.txt`,
            content: generateL3Config(sw, settings),
            type: 'L3'
          };
        } else {
          configs[fileName] = {
            filename: `${fileName}_L2_config.txt`,
            content: generateL2Config(sw, settings),
            type: 'L2'
          };
        }
      } catch (error) {
        // Config generation failed, skip this switch
      }
    });

    // Generate Serials CSV (with renamed filename)
    const csv = generateSiteEngineCsv(switches, serialMap);
    const serialsFilename = `${districtName.replace(/\s+/g, '')}-Serials.csv`;

    const response = {
      success: true,
      configs,
      csv: {
        filename: serialsFilename,
        content: csv
      },
      timestamp: new Date().toISOString()
    };

    // Generate XIQ-SE configs per site
    const xiqseConfigs = generateXIQSEConfigs(switches, districtName);
    response.xiqseConfigs = xiqseConfigs;
    
    // Generate mgmt.csv if not skipping serials
    if (!skipSerials && Object.keys(serialMap).length > 0) {
      try {
        // Convert serialMap to serials array
        const serials = Object.entries(serialMap).map(([switchName, serialData]) => ({
          serialNumber: serialData.serial,
          switchName: switchName,
          siteId: serialData.siteId,
          switchType: serialData.type
        }));
        
        const mgmtCsv = generateMgmtCsv(switches, serials);
        response.mgmtCsv = {
          filename: 'mgmt.csv',
          content: mgmtCsv
        };
      } catch (error) {
        // Failed to generate mgmt.csv, continue without it
      }
    }

    res.json(response);

  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate files',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;