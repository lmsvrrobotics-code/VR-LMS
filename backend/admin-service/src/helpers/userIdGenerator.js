/**
 * User ID Generator
 * Generates unique IDs for students and teachers in format: FirstName+YYYYMMDD-SerialNumber
 * Example: John20260618-01, Priya20260615-03
 */

const db = require('../config/database');

/**
 * Generate a unique ID for a new student or teacher
 * @param {string} fullName - Full name of the user (first word is extracted as first name)
 * @returns {Promise<string>} Unique ID in format: FirstNameYYYYMMDD-SerialNumber
 */
async function generateUniqueId(fullName) {
  try {
    // Extract first name (first word only)
    const firstName = fullName?.trim().split(' ')[0] || 'User';

    // Get today's date in YYYYMMDD format
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD

    // Count how many users were created today
    const result = await db.sequelize.query(
      `SELECT COUNT(*) as count
       FROM lms_admin.users
       WHERE created_at::DATE = CURRENT_DATE`,
      { type: db.sequelize.QueryTypes.SELECT }
    );

    const serialNumber = (result[0]?.count || 0) + 1;
    const paddedSerial = String(serialNumber).padStart(2, '0');

    const uniqueId = `${firstName}${dateStr}-${paddedSerial}`;

    return uniqueId;
  } catch (error) {
    throw new Error(`Failed to generate unique ID: ${error.message}`);
  }
}

/**
 * Validate a unique ID format
 * @param {string} uniqueId - ID to validate
 * @returns {boolean} True if valid format
 */
function validateUniqueIdFormat(uniqueId) {
  // Pattern: FirstName (letters) + YYYYMMDD (8 digits) + "-" + SerialNumber (2+ digits)
  const pattern = /^[A-Za-z]+\d{8}-\d{2,}$/;
  return pattern.test(uniqueId);
}

module.exports = {
  generateUniqueId,
  validateUniqueIdFormat,
};
