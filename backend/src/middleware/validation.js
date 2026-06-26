// src/middleware/validation.js
const Joi = require('joi');

/**
 * Creates a validation middleware from a Joi schema
 * @param {Object} schema - { body, query, params }
 */
function validate(schema) {
  return (req, res, next) => {
    const toValidate = {};
    if (schema.body) toValidate.body = req.body;
    if (schema.query) toValidate.query = req.query;
    if (schema.params) toValidate.params = req.params;

    const combined = Joi.object(
      Object.fromEntries(
        Object.entries(toValidate).map(([key, value]) => [
          key,
          schema[key].validate(value, { abortEarly: false, stripUnknown: true }),
        ])
      )
    );

    const errors = [];
    for (const [location, schema_key] of Object.entries(schema)) {
      const { error, value } = schema_key.validate(toValidate[location], {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        errors.push(...error.details.map(d => ({ field: d.path.join('.'), message: d.message.replace(/"/g, '') })));
      } else if (location === 'body') {
        req.body = value;
      } else if (location === 'query') {
        req.query = value;
      } else if (location === 'params') {
        req.params = value;
      }
    }

    if (errors.length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed.',
        errors,
        code: 'VALIDATION_ERROR',
      });
    }

    next();
  };
}

// ── Schemas ──────────────────────────────────────────────────────────

const authSchemas = {
  requestOTP: Joi.object({
    phone: Joi.string().pattern(/^\d{10}$/).required().messages({
      'string.pattern.base': 'Phone must be a 10-digit number',
      'any.required': 'Phone number is required',
    }),
    full_name: Joi.string().min(2).max(150).optional(),
    email: Joi.string().email().optional().allow('', null),
  }),

  verifyOTP: Joi.object({
    phone: Joi.string().pattern(/^\d{10}$/).required(),
    otp: Joi.string().length(6).pattern(/^\d{6}$/).required().messages({
      'string.length': 'OTP must be exactly 6 digits',
    }),
    password: Joi.string().min(8).max(128).optional(),
    ward_constituency: Joi.string().max(200).optional().allow('', null),
    district: Joi.string().max(100).optional().allow('', null),
  }),

  login: Joi.object({
    phone: Joi.string().pattern(/^\d{10}$/).required(),
    password: Joi.string().min(1).required(),
  }),

  changePassword: Joi.object({
    current_password: Joi.string().required(),
    new_password: Joi.string().min(8).max(128).required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .messages({
        'string.pattern.base': 'Password must contain at least one uppercase, lowercase, and number',
      }),
  }),

  verifyAadhaar: Joi.object({
    aadhaar_number: Joi.string().length(12).pattern(/^\d{12}$/).required().messages({
      'string.length': 'Aadhaar must be exactly 12 digits',
      'string.pattern.base': 'Aadhaar must contain only digits',
    }),
  }),
};

const proposalSchemas = {
  submit: Joi.object({
    title: Joi.string().min(10).max(500).required().messages({
      'string.min': 'Title must be at least 10 characters',
      'string.max': 'Title cannot exceed 500 characters',
    }),
    description: Joi.string().min(50).max(10000).required().messages({
      'string.min': 'Description must be at least 50 characters',
    }),
    region: Joi.string().min(3).max(300).required(),
    ward: Joi.string().max(200).optional().allow('', null),
    district: Joi.string().max(100).optional().allow('', null),
    taluka: Joi.string().max(100).optional().allow('', null),
    pincode: Joi.string().pattern(/^\d{6}$/).optional().allow('', null),
    manual_dept: Joi.string()
      .valid('PWD', 'NMC', 'GramPanchayat', 'RevenueDeskTahsildar', 'SDMDesk')
      .optional().allow('', null),
  }),

  vote: Joi.object({
    vote: Joi.string().valid('upvote', 'downvote').required(),
    critique_text: Joi.string().min(20).max(2000).optional().allow('', null),
  }),

  sanction: Joi.object({
    sanction_note: Joi.string().max(1000).optional().allow('', null),
  }),

  reject: Joi.object({
    rejection_reason: Joi.string().min(10).max(1000).required().messages({
      'string.min': 'Please provide a meaningful rejection reason (min 10 chars)',
    }),
  }),

  requestRevision: Joi.object({
    revision_note: Joi.string().min(10).max(1000).required(),
  }),

  listQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    dept: Joi.string().valid('PWD', 'NMC', 'GramPanchayat', 'RevenueDeskTahsildar', 'SDMDesk').optional(),
    status: Joi.string().optional(),
    sort: Joi.string().valid('recent', 'popular', 'approval').default('recent'),
    search: Joi.string().max(200).optional(),
    district: Joi.string().max(100).optional(),
    threshold_met: Joi.string().valid('true', 'false').optional(),
  }),

  uuidParam: Joi.object({
    id: Joi.string().uuid({ version: 'uuidv4' }).required().messages({
      'string.guid': 'Invalid proposal ID format',
    }),
  }),
};

const adminSchemas = {
  createAdmin: Joi.object({
    full_name: Joi.string().min(2).max(150).required(),
    phone: Joi.string().pattern(/^\d{10}$/).required(),
    email: Joi.string().email().optional().allow('', null),
    dept: Joi.string()
      .valid('PWD', 'NMC', 'GramPanchayat', 'RevenueDeskTahsildar', 'SDMDesk')
      .required(),
    department_designation: Joi.string().max(200).optional().allow('', null),
  }),

  updateConfig: Joi.object({
    value: Joi.alternatives().try(
      Joi.string(),
      Joi.number(),
      Joi.boolean(),
      Joi.object(),
      Joi.array()
    ).required(),
  }),
};

module.exports = {
  validate,
  authSchemas,
  proposalSchemas,
  adminSchemas,
};
