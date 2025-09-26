# Setshaba Connect Backend API

A comprehensive backend API for the Setshaba Connect hackathon project, enabling citizens to report municipal issues and officials to manage them effectively. Built for "Harnessing Intelligence for Sustainable Development" with advanced analytics, accountability features, and AI-ready data exports.

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
- Official profiles with photos, job titles, and departments
- Secure user data handling

### Report Management
- Citizens can create, view, and upvote reports
- Officials can view and manage reports in their municipality
- Comprehensive report categorization
- Status tracking and assignment system
- Geolocation-based municipality detection
- Full accountability trail with official attribution

### Accountability & Transparency
- All report updates linked to specific municipal officials
- Timestamped status updates with official details
- Complete audit trail for all report changes
- Official profiles with names, roles, and contact information
- Internal notes system for officials

### Analytics & Intelligence
- Comprehensive analytics dashboard for officials
- Time-series data for trend analysis
- Ward-based hotspot identification
- AI-ready data exports for machine learning
- Predictive insights and automated classification support
- Category and status breakdown analytics

### GeoJSON & Ward Management
- Live ward boundary import from GitHub repository
- Simplified geometry for optimal performance
- Bulk import/update capabilities
- Ward-based report analytics
- Optimized boundary serving for map rendering

### Municipality Support
- Municipality database with geographic boundaries
- Automatic municipality assignment based on location
- Municipal officials can only access their jurisdiction

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with tokens

### Users
- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update current user profile
- `GET /api/users/:id` - Get user by ID (with permission checks)

### Reports
- `POST /api/reports` - Create new report (citizens only)
- `GET /api/reports/mine` - Get current user's reports (citizens only)
- `GET /api/reports` - Get all reports with filtering
- `GET /api/reports/municipality` - Get municipality reports (officials only)
- `GET /api/reports/:id` - Get single report
- `POST /api/reports/:id/upvote` - Upvote/remove upvote (citizens only)
- `DELETE /api/reports/:id/upvote` - Remove upvote (citizens only)
- `PUT /api/reports/:id` - Update report status/assignment (officials only)
- `DELETE /api/reports/:id` - Delete report (owner only)

### Status Updates & Accountability
- `POST /api/reports/:reportId/status` - Add status update (officials only)
- `GET /api/reports/:reportId/status` - Get status updates for report
- `GET /api/reports/:reportId/history` - Get complete accountability history

### Municipalities
- `GET /api/municipalities` - Get all municipalities
- `GET /api/municipalities/:id` - Get single municipality
- `GET /api/municipalities/:id/reports` - Get reports within municipality
- `POST /api/municipalities/import` - Bulk import municipalities (officials only)

### Wards & GeoJSON
- `GET /api/wards` - Get all wards (with optional municipality filter)
- `GET /api/wards/:wardId` - Get single ward by ID
- `POST /api/wards/import` - Bulk import wards from GeoJSON URL
- `POST /api/wards/import-live` - Import from live GitHub GeoJSON
- `GET /api/wards/boundaries/simplified` - Get simplified boundaries for maps
- `GET /api/wards/statistics` - Get ward-based analytics

### Analytics & Intelligence
- `GET /api/analytics/dashboard` - Comprehensive analytics dashboard (officials only)
- `GET /api/analytics/timeseries` - Time-series data for charts (officials only)
- `GET /api/analytics/ai-export` - AI-ready data export (officials only)

## Example API Usage

### Creating a Report
```json
POST /api/reports
Authorization: Bearer <citizen_token>
Content-Type: application/json

{
  "title": "Broken streetlight on Main Street",
  "description": "The streetlight has been broken for over a week, making the area unsafe at night.",
  "category": "safety",
  "lat": -26.2041,
  "lng": 28.0473,
  "address": "123 Main Street, Johannesburg",
  "photo_url": "https://example.com/photo.jpg"
}
```

### Adding Status Update (Official)
```json
POST /api/reports/{reportId}/status
Authorization: Bearer <official_token>
Content-Type: application/json

{
  "update_text": "We have received your report and assigned a technician to investigate the issue.",
  "new_status": "acknowledged",
  "internal_notes": "Assigned to John from electrical department"
}
```

### Importing Live Ward Data
```json
POST /api/wards/import-live
Authorization: Bearer <official_token>
Content-Type: application/json

{
  "municipality_id": "uuid-here"
}
```

### Getting Analytics Dashboard
```json
GET /api/analytics/dashboard?days=30
Authorization: Bearer <official_token>

Response:
{
  "success": true,
  "data": {
    "summary": {
      "total_reports": 150,
      "pending_reports": 45,
      "resolved_reports": 89,
      "avg_resolution_days": 5.2
    },
    "category_breakdown": {
      "water": 45,
      "roads": 32,
      "electricity": 28,
      "waste": 25,
      "safety": 20
    },
    "trending_wards": {
      "Ward 1 (001)": 25,
      "Ward 5 (005)": 18,
      "Ward 3 (003)": 15
    },
    "ai_insights": {
      "most_reported_category": "water",
      "hotspot_ward": "Ward 1 (001)",
      "resolution_trend": "improving"
    }
  }
}
```

### Simplified GeoJSON for Maps
```json
GET /api/wards/boundaries/simplified?municipality_id=uuid-here

Response:
{
  "success": true,
  "data": {
    "geojson": {
      "type": "FeatureCollection",
      "metadata": {
        "total_features": 25,
        "municipality_id": "uuid-here",
        "generated_at": "2025-01-25T10:30:00Z",
        "cache_duration": "1 hour"
      },
      "features": [
        {
          "type": "Feature",
          "properties": {
            "ward_id": "001",
            "name": "Ward 1"
          },
          "geometry": {
            "type": "Polygon",
            "coordinates": [[[28.0, -26.0], [28.1, -26.0], [28.1, -26.1], [28.0, -26.1], [28.0, -26.0]]]
          }
        }
      ]
    }
  }
}
```

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

5. **Import Ward Data (Optional)**
   ```bash
   # Use the API endpoint to import live ward data
   curl -X POST http://localhost:3000/api/wards/import-live \
     -H "Authorization: Bearer <official_token>" \
     -H "Content-Type: application/json" \
     -d '{"municipality_id": "your-municipality-id"}'
   ```

## Database Schema

### Users Table
- Stores user profiles linked to Supabase Auth
- Role-based differentiation (citizen/official)
- Geographic information for location-based features
- Municipality associations for officials
- Official profile enhancements (photo, job title, department)

### Reports Table
- Complete issue reporting with categorization
- Status tracking (pending → acknowledged → in_progress → resolved)
- Geolocation data for precise incident location
- Assignment system for municipal officials
- Community engagement through upvoting
- Full accountability with official attribution

### Status Updates Table
- Timestamped updates linked to specific officials
- Status change tracking (before/after states)
- Internal notes for official communication
- Complete audit trail for transparency

### Wards Table
- GeoJSON geometry storage with simplified boundaries
- Municipality associations
- Bulk import capabilities from live data sources
- Optimized for map rendering performance

### Supporting Tables
- `municipalities` - Municipal boundaries and information
- `report_upvotes` - User engagement tracking

## Performance Optimizations

### Caching Strategy
- Ward boundaries: 1 hour cache
- Analytics data: 5-10 minute cache
- Report lists: 1 minute cache
- Static municipality data: 2 hour cache

### Database Optimizations
- Comprehensive indexing for analytics queries
- Materialized views for complex ward queries
- Batch processing for large imports
- Query pagination for large datasets

### Free Tier Considerations
- Reduced batch sizes for imports (50 records)
- Aggressive caching to reduce database load
- Simplified geometry for ward boundaries
- Rate limiting on expensive operations

## Security Features

- Row Level Security (RLS) on all tables
- JWT token validation
- Role-based endpoint protection
- Input validation and sanitization
- Rate limiting on sensitive endpoints
- CORS configuration for production
- Comprehensive audit trails
- Official accountability measures

## AI & Analytics Features

### Data Export Format
The `/api/analytics/ai-export` endpoint provides structured data for machine learning:

```json
{
  "text_features": ["title", "description", "word_count"],
  "categorical_features": ["category", "status", "ward_name"],
  "numerical_features": ["latitude", "longitude", "upvotes"],
  "temporal_features": ["hour_of_day", "day_of_week", "month"],
  "geospatial_features": ["ward_properties"]
}
```

### Suggested ML Applications
- **Report Classification**: Automatic categorization of new reports
- **Priority Prediction**: Identify high-priority issues based on historical data
- **Resolution Time Estimation**: Predict how long issues will take to resolve
- **Hotspot Detection**: Identify emerging problem areas
- **Sentiment Analysis**: Analyze citizen satisfaction from report text

## Technology Stack

- **Runtime**: Node.js with Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth with JWT
- **Validation**: Joi schema validation
- **Security**: Helmet, CORS, Rate limiting
- **Analytics**: Custom PostgreSQL functions
- **GeoJSON**: Live import from GitHub repository

## Development

The API is structured with clear separation of concerns:
- `/routes` - API endpoint definitions
- `/middleware` - Authentication and validation middleware
- `/config` - Database and service configurations
- `/utils` - Helper functions and utilities
- `/migrations` - Database schema updates

Each module is kept under 300 lines for maintainability and follows RESTful conventions.

## Production Considerations

- Set appropriate CORS origins
- Configure rate limiting for production load
- Use environment-specific JWT secrets
- Enable Supabase Auth email confirmation
- Set up proper logging and monitoring
- Configure caching headers appropriately
- Monitor database performance on free tier
- Set up automated ward data synchronization

## Hackathon Features Highlight

### Intelligence for Sustainable Development
1. **Predictive Analytics**: Identify trends and patterns in municipal issues
2. **Resource Optimization**: Help officials prioritize based on data-driven insights
3. **Transparency**: Complete accountability trail for all municipal actions
4. **Community Engagement**: Upvoting system to surface community priorities
5. **Geospatial Intelligence**: Ward-based analytics for targeted interventions
6. **AI-Ready Data**: Structured exports for machine learning applications

### Sustainability Focus
- Efficient data structures to minimize resource usage
- Caching strategies to reduce server load
- Optimized queries for free-tier database constraints
- Simplified geometries for reduced bandwidth usage