import Joi from 'joi';

export const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }
    
    next();
  };
};

// Validation schemas
export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('citizen', 'official').default('citizen'),
  municipality_id: Joi.string().uuid().when('role', {
    is: 'official',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  home_address: Joi.string().max(500).optional(),
  lat: Joi.number().min(-90).max(90).optional(),
  lng: Joi.number().min(-180).max(180).optional()
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

export const createReportSchema = Joi.object({
  title: Joi.string().min(5).max(200).required(),
  description: Joi.string().min(10).max(2000).required(),
  category: Joi.string().valid('water', 'electricity', 'roads', 'waste', 'safety', 'other').required(),
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  address: Joi.string().max(500).required(),
  photo_url: Joi.string().uri().optional()
});

export const updateReportSchema = Joi.object({
  title: Joi.string().min(5).max(200).optional(),
  description: Joi.string().min(10).max(2000).optional(),
  category: Joi.string().valid('water', 'electricity', 'roads', 'waste', 'safety', 'other').optional(),
  photo_url: Joi.string().uri().optional(),
  status: Joi.string().valid('pending', 'acknowledged', 'in_progress', 'resolved').optional(),
  assigned_official: Joi.string().uuid().optional()
});