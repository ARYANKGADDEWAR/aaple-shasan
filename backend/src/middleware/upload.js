// src/middleware/upload.js
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const logger = require('../config/logger');

// Ensure upload directory exists
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const TEMP_DIR = path.join(UPLOAD_DIR, 'temp');
[UPLOAD_DIR, TEMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const MAX_SIZE_BYTES = (parseInt(process.env.UPLOAD_MAX_SIZE_MB) || 10) * 1024 * 1024;

// Storage: save to temp with randomised filename
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname).toLowerCase()}`;
    cb(null, uniqueName);
  },
});

// File filter — MIME type + extension double-check
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
  if (!allowedExts.includes(ext)) {
    return cb(new Error(`File extension not allowed: ${ext}`), false);
  }

  // Prevent path traversal in filename
  if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
    return cb(new Error('Invalid filename'), false);
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_SIZE_BYTES,
    files: 5,
    fields: 20,
  },
});

// Validate uploaded file magic bytes (actual content vs claimed type)
async function validateFileMagicBytes(filePath, mimeType) {
  const buffer = Buffer.alloc(8);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 8, 0);
  fs.closeSync(fd);

  const hex = buffer.toString('hex').toUpperCase();

  const signatures = {
    'image/jpeg': ['FFD8FF'],
    'image/png': ['89504E47'],
    'image/webp': ['52494646'],
    'application/pdf': ['25504446'],
  };

  const expected = signatures[mimeType];
  if (!expected) return false;

  return expected.some(sig => hex.startsWith(sig));
}

// Middleware: process + validate uploaded files
async function processUpload(req, res, next) {
  if (!req.files || req.files.length === 0) return next();

  const validFiles = [];
  const errors = [];

  for (const file of req.files) {
    try {
      const isValid = await validateFileMagicBytes(file.path, file.mimetype);
      if (!isValid) {
        fs.unlinkSync(file.path);
        errors.push(`${file.originalname}: File content does not match declared type`);
        continue;
      }

      // Move to permanent location
      const finalDir = path.join(UPLOAD_DIR, 'proposals');
      if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

      const finalPath = path.join(finalDir, file.filename);
      fs.renameSync(file.path, finalPath);

      validFiles.push({
        originalName: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        url: `/uploads/proposals/${file.filename}`,
      });
    } catch (err) {
      logger.error('File processing error', { file: file.originalname, error: err.message });
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      errors.push(`${file.originalname}: Processing failed`);
    }
  }

  if (errors.length > 0 && validFiles.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'All uploaded files failed validation.',
      errors,
    });
  }

  req.processedFiles = validFiles;
  if (errors.length > 0) req.fileWarnings = errors;

  next();
}

// Multer error handler
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: `File too large. Maximum size is ${process.env.UPLOAD_MAX_SIZE_MB || 10}MB.`,
      LIMIT_FILE_COUNT: 'Too many files. Maximum 5 files allowed.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field.',
    };
    return res.status(400).json({
      success: false,
      message: messages[err.code] || 'File upload error.',
      code: err.code,
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload failed.',
    });
  }
  next();
}

module.exports = {
  upload,
  processUpload,
  handleMulterError,
};
