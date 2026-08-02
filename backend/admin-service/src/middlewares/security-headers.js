/**
 * Security headers middleware
 * Adds OWASP-recommended headers to prevent common attacks
 */

const securityHeaders = (req, res, next) => {
    // Prevent clickjacking (X-Frame-Options)
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent MIME sniffing (Content-Type sniffing attacks)
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Enable XSS protection (older browsers)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer policy: don't leak internal URLs to external sites
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Strict transport security (HTTPS only) — only in production
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Content Security Policy (CSP) — prevent inline scripts, restrict sources
    // For API endpoints, this is less critical but still good practice
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'"
    );

    // Permissions policy — restrict browser features
    res.setHeader(
        'Permissions-Policy',
        'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
    );

    next();
};

module.exports = securityHeaders;
