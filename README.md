# Setshaba Connect Backend API

A comprehensive backend API for the Setshaba Connect hackathon project, enabling citizens to report municipal issues and officials to manage them effectively.

## Features

### Authentication & Authorization
- JWT-based authentication with Supabase
- Role-based access control (citizens and municipality officials)
- Secure password handling
- Token-based session management

### User Management
- User registration for citizens and officials
- Profile management with geolocation support
- Municipality association for officials
- Secure user data handling

### Report Management
- Citizens can create, view, and upvote reports
- Officials can view and manage reports in their municipality
- Comprehensive report categorization
- Status tracking and assignment system
- Geolocation-based municipality detection

### Municipality Support
- Municipality database with geographic boundaries
- Automatic municipality assignment based on location
- Municipal officials can only access their jurisdiction

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login

### Users
- `GET /api/users/me` - Get current user profile
- `GET /api/users/:id` - Get user by ID (with permission checks)

### Reports
- `POST /api/reports` - Create new report (citizens only)
- `GET /api/reports/mine` - Get current user's reports (citizens only)
- `GET /api/reports` - Get municipality reports (officials only)
- `GET /api/reports/:id` - Get single report
- `POST /api/reports/:id/upvote` - Upvote/remove upvote (citizens only)
- `PUT /api/reports/:id` - Update report status/assignment (officials only)

### Municipalities
- `GET /api/municipalities` - Get all municipalities
- `GET /api/municipalities/:id` - Get single municipality

## Setup Instructions

1. **Environment Variables**
   ```bash
   cp .env.example .env
   ```
   Fill in your Supabase credentials and JWT secret.

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Database Setup**
   - Connect to Supabase using the button in the top right
   - The migrations will be applied automatically

4. **Start Development Server**
   ```bash
   npm run dev
   ```

## Database Schema

### Users Table
- Stores user profiles linked to Supabase Auth
- Role-based differentiation (citizen/official)
- Geographic information for location-based features
- Municipality associations for officials

### Reports Table
- Complete issue reporting with categorization
- Status tracking (pending → acknowledged → in_progress → resolved)
- Geolocation data for precise incident location
- Assignment system for municipal officials
- Community engagement through upvoting

### Supporting Tables
- `municipalities` - Municipal boundaries and information
- `report_upvotes` - User engagement tracking

## Security Features

- Row Level Security (RLS) on all tables
- JWT token validation
- Role-based endpoint protection
- Input validation and sanitization
- Rate limiting on sensitive endpoints
- CORS configuration for production

## Technology Stack

- **Runtime**: Node.js with Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth with JWT
- **Validation**: Joi schema validation
- **Security**: Helmet, CORS, Rate limiting

## Development

The API is structured with clear separation of concerns:
- `/routes` - API endpoint definitions
- `/middleware` - Authentication and validation middleware
- `/config` - Database and service configurations
- `/utils` - Helper functions and utilities

Each module is kept under 300 lines for maintainability and follows RESTful conventions.

## Production Considerations

- Set appropriate CORS origins
- Configure rate limiting for production load
- Use environment-specific JWT secrets
- Enable Supabase Auth email confirmation
- Set up proper logging and monitoring