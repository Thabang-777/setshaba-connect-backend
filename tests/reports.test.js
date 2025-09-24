import request from 'supertest';
import app from '../server.js';

describe('Reports Endpoints', () => {
  let authToken;
  let userId;
  let reportId;

  const testUser = {
    name: 'Test Citizen',
    email: `citizen${Date.now()}@example.com`,
    password: 'testpassword123',
    role: 'citizen'
  };

  const testReport = {
    title: 'Broken streetlight on Main Street',
    description: 'The streetlight has been broken for over a week, making the area unsafe at night.',
    category: 'safety',
    lat: -26.2041,
    lng: 28.0473,
    address: '123 Main Street, Johannesburg'
  };

  beforeAll(async () => {
    // Register and login user
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });

    authToken = loginResponse.body.data.access_token;
    userId = loginResponse.body.data.user.id;
  });

  describe('POST /api/reports', () => {
    it('should create a new report successfully', async () => {
      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testReport)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.report).toHaveProperty('id');
      expect(response.body.data.report.title).toBe(testReport.title);
      expect(response.body.data.report.created_by).toBe(userId);

      reportId = response.body.data.report.id;
    });

    it('should return error without authentication', async () => {
      const response = await request(app)
        .post('/api/reports')
        .send(testReport)
        .expect(401);

      expect(response.body.error).toBe('Access token required');
    });

    it('should return validation error for invalid data', async () => {
      const invalidReport = { ...testReport, title: 'abc' }; // too short

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidReport)
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });
  });

  describe('GET /api/reports', () => {
    it('should fetch all reports successfully', async () => {
      const response = await request(app)
        .get('/api/reports')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.reports).toBeInstanceOf(Array);
      expect(response.body.data).toHaveProperty('total');
    });

    it('should filter reports by category', async () => {
      const response = await request(app)
        .get('/api/reports?category=safety')
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.reports.forEach(report => {
        expect(report.category).toBe('safety');
      });
    });

    it('should search reports by text', async () => {
      const response = await request(app)
        .get('/api/reports?search=streetlight')
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should find our test report
      const foundReport = response.body.data.reports.find(r => r.id === reportId);
      expect(foundReport).toBeDefined();
    });
  });

  describe('GET /api/reports/:id', () => {
    it('should fetch single report with details', async () => {
      const response = await request(app)
        .get(`/api/reports/${reportId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.report.id).toBe(reportId);
      expect(response.body.data.report).toHaveProperty('upvote_count');
      expect(response.body.data.report).toHaveProperty('user_upvoted');
    });

    it('should return 404 for non-existent report', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      
      const response = await request(app)
        .get(`/api/reports/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Report not found');
    });
  });

  describe('POST /api/reports/:id/upvote', () => {
    let otherAuthToken;

    beforeAll(async () => {
      // Create another user to test upvoting
      const otherUser = {
        name: 'Other User',
        email: `other${Date.now()}@example.com`,
        password: 'testpassword123',
        role: 'citizen'
      };

      await request(app)
        .post('/api/auth/register')
        .send(otherUser);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: otherUser.email,
          password: otherUser.password
        });

      otherAuthToken = loginResponse.body.data.access_token;
    });

    it('should upvote a report successfully', async () => {
      const response = await request(app)
        .post(`/api/reports/${reportId}/upvote`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.upvoted).toBe(true);
    });

    it('should not allow upvoting own report', async () => {
      const response = await request(app)
        .post(`/api/reports/${reportId}/upvote`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toBe('Cannot upvote your own report');
    });
  });

  describe('DELETE /api/reports/:id/upvote', () => {
    let otherAuthToken;

    beforeAll(async () => {
      // Create another user and upvote the report first
      const otherUser = {
        name: 'Another User',
        email: `another${Date.now()}@example.com`,
        password: 'testpassword123',
        role: 'citizen'
      };

      await request(app)
        .post('/api/auth/register')
        .send(otherUser);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: otherUser.email,
          password: otherUser.password
        });

      otherAuthToken = loginResponse.body.data.access_token;

      // Upvote first
      await request(app)
        .post(`/api/reports/${reportId}/upvote`)
        .set('Authorization', `Bearer ${otherAuthToken}`);
    });

    it('should remove upvote successfully', async () => {
      const response = await request(app)
        .delete(`/api/reports/${reportId}/upvote`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.upvoted).toBe(false);
    });

    it('should return error when removing non-existent upvote', async () => {
      const response = await request(app)
        .delete(`/api/reports/${reportId}/upvote`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .expect(400);

      expect(response.body.error).toBe('You have not upvoted this report');
    });
  });
});