export const validateContentType = (req, res, next) => {
  const contentType = req.headers['content-type'];
  if (contentType && !contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'Invalid content type' });
  }
  next();
};

export const validateExcelFile = (file) => {
  if (!file) throw new Error('No file uploaded');
  
  const allowedMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ];
  
  if (!allowedMimes.includes(file.mimetype)) {
    throw new Error('Invalid file type. Only .xlsx and .xls files allowed');
  }
  
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new Error('File too large. Maximum 10MB allowed');
  }
  
  return true;
};

export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.replace(/[<>\"']/g, '').trim();
};

export const validateSiteID = (siteId) => {
  const id = parseInt(siteId);
  if (isNaN(id) || id < 1 || id > 255) {
    throw new Error('Invalid SiteID. Must be between 1-255');
  }
  return id;
};

export const validateIPAddress = (ip) => {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  if (!ipv4Regex.test(ip)) {
    throw new Error('Invalid IP address format');
  }
  const parts = ip.split('/')[0].split('.');
  for (let part of parts) {
    const num = parseInt(part);
    if (num > 255) {
      throw new Error('Invalid IP address: octets must be 0-255');
    }
  }
  return ip;
};

export const validateSerialNumber = (serial) => {
  if (!serial || serial.length < 5 || serial.length > 50) {
    throw new Error('Invalid serial number format');
  }
  return serial;
};

export const sanitizeFileName = (name) => {
  return name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
};
