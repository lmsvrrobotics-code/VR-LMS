import api from './client';

// Admin email/SMTP settings (Brevo etc.). Base client points at /api/admin.
export const getEmailSettings = () => api.get('/settings/email').then((r) => r.data);
export const saveEmailSettings = (body) => api.put('/settings/email', body).then((r) => r.data);
export const sendTestEmail = (to) => api.post('/settings/email/test', { to }).then((r) => r.data);

// Razorpay payment keys. key_id is returned in the clear; secrets only as a
// set/unset flag. Saving a blank secret keeps the existing one.
export const getPaymentSettings = () => api.get('/settings/payment').then((r) => r.data);
export const savePaymentSettings = (body) => api.put('/settings/payment', body).then((r) => r.data);
