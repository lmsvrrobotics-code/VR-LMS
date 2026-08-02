import DOMPurify from 'dompurify';

// Sanitize HTML to prevent XSS attacks
export const sanitizeHtml = (dirty: string): string => {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a'] });
};

// Escape plain text (strip all HTML)
export const escapeText = (text: string): string => {
  if (!text) return '';
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
};

// Sanitize object properties (for display, not storage)
export const sanitizeObject = (obj: Record<string, any>, fieldsToSanitize: string[] = []): Record<string, any> => {
  if (!obj) return {};
  const sanitized = { ...obj };
  fieldsToSanitize.forEach(field => {
    if (sanitized[field] && typeof sanitized[field] === 'string') {
      sanitized[field] = escapeText(sanitized[field]);
    }
  });
  return sanitized;
};
