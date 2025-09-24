import request from 'supertest';
import app from '../server.js';

describe('Users Endpoints', () => {
  let authToken;
  let userId;

  const testUser = {
    name: 'Test User Profile',
    email: `profile${Date.now()}@example.com`,
    password: 'testpassword123',
    role: 'citizen',
    home_address: '123 Test Street'
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

  describe('GET /api/users/me', () => {
    it('should get current user profile successfully', async () => {
      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(userId);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user.name).toBe(testUser.name);
    });

    it('should return error without authentication', async () => {
      const response = await request(app)
        .get('/api/users/me')
        .expect(401);

      expect(response.body.error).toBe('Access token required');
    });
  });

  describe('PUT /api/users/me', () => {
    it('should update user profile successfully', async () => {
      const updates = {
        name: 'Updated Test User',
        home_address: '456 Updated Street',
        lat: -26.2041,
        lng: 28.0473
      };

      const response = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.name).toBe(updates.name);
      expect(response.body.data.user.home_address).toBe(updates.home_address);
      expect(response.body.data.user.lat).toBe(updates.lat);
      expect(response.body.data.user.lng).toBe(updates.lng);
    });

    it('should return validation error for invalid data', async () => {
      const invalidUpdates = {
        name: 'A', // too short
        lat: 100 // invalid latitude
      };

      const response = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidUpdates)
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should return error for empty update', async () => {
      const response = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('No valid fields to update');
    });

    it('should return error without authentication', async () => {
      const response = await request(app)
        .put('/api/users/me')
        .send({ name: 'New Name' })
        .expect(401);

      expect(response.body.error).toBe('Access token required');
    });
  });

  describe('GET /api/users/:id', () => {
    it('should get own user profile by ID', async () => {
      const response = await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(userId);
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      
      const response = await request(app)
        .get(`/api/users/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('User not found');
    });
  });
});