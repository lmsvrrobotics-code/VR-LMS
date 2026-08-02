// ✅ XSS Protection - Sanitize user input

/**
 * Sanitize string input to prevent XSS attacks
 * Removes HTML/JavaScript tags and special characters
 */
export function sanitizeString(input) {
  if (typeof input !== 'string') {
    return input;
  }

  return input
    .trim()
    .replace(/[<>\"'&]/g, (char) => {
      const map = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;',
      };
      return map[char];
    });
}

/**
 * Sanitize entire object (all string values)
 */
export function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === 'string' ? sanitizeString(item) : item
      );
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Middleware to automatically sanitize request body
 */
export function sanitizeMiddleware(req, res, next) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  next();
}
