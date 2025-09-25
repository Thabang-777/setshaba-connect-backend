import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Setshaba Connect API',
      version: '1.0.0',
      description: 'Backend API for Setshaba Connect - connecting communities with municipalities',
      contact: {
        name: 'Setshaba Connect Team',
        email: 'support@setshabaconnect.com'
      }
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://your-api-domain.com' 
          : 'http://localhost:3000',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['citizen', 'official'] },
            municipality_id: { type: 'string', format: 'uuid' },
            home_address: { type: 'string' },
            lat: { type: 'number' },
            lng: { type: 'number' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        ForgotPasswordRequest: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email', description: 'Email address to send reset link to' }
          }
        },
        ResetPasswordRequest: {
          type: 'object',
          required: ['access_token', 'refresh_token', 'new_password'],
          properties: {
            access_token: { type: 'string', description: 'Access token from reset link' },
            refresh_token: { type: 'string', description: 'Refresh token from reset link' },
            new_password: { type: 'string', minLength: 6, description: 'New password (minimum 6 characters)' }
          }
        },
        Report: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string', enum: ['water', 'electricity', 'roads', 'waste', 'safety', 'other'] },
            lat: { type: 'number' },
            lng: { type: 'number' },
            address: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'acknowledged', 'in_progress', 'resolved'] },
            municipality_id: { type: 'string', format: 'uuid' },
            created_by: { type: 'string', format: 'uuid' },
            assigned_official: { type: 'string', format: 'uuid' },
            upvotes: { type: 'integer' },
            photo_url: { type: 'string', format: 'uri' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Municipality: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            province: { type: 'string' },
            bounds: { type: 'object' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        StatusUpdate: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            report_id: { type: 'string', format: 'uuid' },
            update_text: { type: 'string' },
            created_by: { type: 'string', format: 'uuid' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            statusCode: { type: 'integer' },
            details: { type: 'array', items: { type: 'string' } },
            timestamp: { type: 'string', format: 'date-time' }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./routes/*.js', './server.js']
};

const specs = swaggerJsdoc(options);

export { swaggerUi, specs };