const mongoose = require('mongoose');

/**
 * Middleware to set standard HTTP security headers to protect against
 * common web vulnerabilities (XSS, Clickjacking, sniffing, etc.).
 */
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none';");
  next();
};

/**
 * Recursively deletes any keys starting with '$' to prevent NoSQL query injection attacks.
 * @param {Object} obj - The object to sanitize.
 */
const sanitizeNoSql = (obj) => {
  if (obj && typeof obj === 'object') {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (key.startsWith('$')) {
          delete obj[key];
        } else if (typeof obj[key] === 'object') {
          sanitizeNoSql(obj[key]);
        }
      }
    }
  }
};

/**
 * Middleware to sanitize inputs (body, query, params) from MongoDB operator injection.
 */
const noSqlSanitizer = (req, res, next) => {
  if (req.body) sanitizeNoSql(req.body);
  if (req.query) sanitizeNoSql(req.query);
  if (req.params) sanitizeNoSql(req.params);
  next();
};

/**
 * Factory that returns a custom memory-based rate limiter middleware.
 * @param {Object} options - Rate limiting configuration.
 * @param {number} options.windowMs - Time frame in milliseconds. Defaults to 1 minute.
 * @param {number} options.max - Maximum requests allowed per IP in the window. Defaults to 30.
 * @param {string} options.message - Error message returned when limit is exceeded.
 */
const rateLimiter = (options = {}) => {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 30;
  const message = options.message || 'Too many requests from this IP, please try again later.';

  // Private memory store for this specific rate limiter instance to isolate counts
  const instanceLimits = new Map();

  // Periodic cleanup for this rate limiter instance to prevent memory leaks
  const intervalId = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of instanceLimits.entries()) {
      if (now > record.resetTime) {
        instanceLimits.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  
  if (intervalId && typeof intervalId.unref === 'function') {
    intervalId.unref();
  }

  return (req, res, next) => {
    // If running behind a proxy, client IP is usually in headers. Otherwise fallback to socket.
    const ip = req.headers['x-forwarded-for'] || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    const now = Date.now();

    let record = instanceLimits.get(ip);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      instanceLimits.set(ip, record);
      return next();
    }

    record.count++;

    if (record.count > max) {
      return res.status(429).json({
        error: message,
        retryAfterMs: Math.max(0, record.resetTime - now)
      });
    }

    next();
  };
};

/**
 * Middleware to validate that a request parameter is a valid MongoDB/Mongoose ObjectId.
 * @param {string} paramName - Name of the route parameter to validate (e.g. 'id').
 */
const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: `Invalid identifier format: ${paramName}` });
    }
    next();
  };
};

/**
 * Basic XSS string sanitizer. Strips HTML tags and script patterns to prevent injection.
 * @param {string} str - String to sanitize.
 * @returns {string} Sanitized string.
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  // Strip out HTML tag patterns
  return str.replace(/<[^>]*>/g, '').trim();
};

module.exports = {
  securityHeaders,
  noSqlSanitizer,
  rateLimiter,
  validateObjectId,
  sanitizeString
};
