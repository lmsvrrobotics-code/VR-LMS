import Joi from 'joi';

// ✅ Centralized validation schemas
export const schemas = {
  login: Joi.object({
    email: Joi.string()
      .email()
      .required()
      .max(255)
      .messages({ 'any.required': 'Email is required' }),
    password: Joi.string()
      .min(6)
      .max(255)
      .required()
      .messages({ 'any.required': 'Password is required' }),
  }),

  register: Joi.object({
    email: Joi.string().email().required().max(255),
    password: Joi.string().min(6).max(255).required(),
    name: Joi.string().min(2).max(255).required(),
  }),

  refresh: Joi.object({
    refreshToken: Joi.string().required(),
  }),

  updateProfile: Joi.object({
    name: Joi.string().max(255),
    phone: Joi.string().max(20),
    email: Joi.string().email().max(255),
    dob: Joi.date(),
    gender: Joi.string().valid('male', 'female', 'other'),
  }).min(1), // At least one field required

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).max(255).required(),
    confirmPassword: Joi.string()
      .valid(Joi.ref('newPassword'))
      .required()
      .messages({ 'any.only': 'Passwords do not match' }),
  }),

  resetPassword: Joi.object({
    email: Joi.string().email().required(),
  }),

  verifyPasswordReset: Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().min(6).max(255).required(),
  }),
};

// ✅ Validation middleware
export function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true, // Remove unknown fields (security)
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details,
      });
    }

    // Store validated data
    req.validatedBody = value;
    next();
  };
}

// ✅ Validation for query params
export function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));

      return res.status(400).json({
        error: 'Invalid query parameters',
        details,
      });
    }

    req.validatedQuery = value;
    next();
  };
}
