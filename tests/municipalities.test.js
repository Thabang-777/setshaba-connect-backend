import request from 'supertest';
import app from '../server.js';

describe('Municipalities Endpoints', () => {
  describe('GET /api/municipalities', () => {
    it('should fetch all municipalities successfully', async () => {
      const response = await request(app)
        .get('/api/municipalities')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.municipalities).toBeInstanceOf(Array);
    });

    it('should fetch municipalities with geojson when requested', async () => {
      const response = await request(app)
        .get('/api/municipalities?include_geojson=true')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.municipalities).toBeInstanceOf(Array);
      
      if (response.body.data.municipalities.length > 0) {
        expect(response.body.data.municipalities[0]).toHaveProperty('bounds');
      }
    });
  });

  describe('GET /api/municipalities/:id', () => {
    let municipalityId;

    beforeAll(async () => {
      // Get a municipality ID for testing
      const response = await request(app)
        .get('/api/municipalities');
      
      if (response.body.data.municipalities.length > 0) {
        municipalityId = response.body.data.municipalities[0].id;
      }
    });

    it('should fetch single municipality successfully', async () => {
      if (!municipalityId) {
        console.log('Skipping test - no municipalities available');
        return;
      }

      const response = await request(app)
        .get(`/api/municipalities/${municipalityId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.municipality.id).toBe(municipalityId);
    });

    it('should fetch municipality with reports when requested', async () => {
      if (!municipalityId) {
        console.log('Skipping test - no municipalities available');
        return;
      }

      const response = await request(app)
        .get(`/api/municipalities/${municipalityId}?include_reports=true`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('reports');
      expect(response.body.data).toHaveProperty('reports_total');
    });

    it('should return 404 for non-existent municipality', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      
      const response = await request(app)
        .get(`/api/municipalities/${fakeId}`)
        .expect(404);

      expect(response.body.error).toBe('Municipality not found');
    });
  });

  describe('GET /api/municipalities/:id/reports', () => {
    let municipalityId;

    beforeAll(async () => {
      // Get a municipality ID for testing
      const response = await request(app)
        .get('/api/municipalities');
      
      if (response.body.data.municipalities.length > 0) {
        municipalityId = response.body.data.municipalities[0].id;
      }
    });

    it('should fetch municipality reports successfully', async () => {
      if (!municipalityId) {
        console.log('Skipping test - no municipalities available');
        return;
      }

      const response = await request(app)
        .get(`/api/municipalities/${municipalityId}/reports`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.reports).toBeInstanceOf(Array);
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data.municipality.id).toBe(municipalityId);
    });

    it('should filter municipality reports by status', async () => {
      if (!municipalityId) {
        console.log('Skipping test - no municipalities available');
        return;
      }

      const response = await request(app)
        .get(`/api/municipalities/${municipalityId}/reports?status=pending`)
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.reports.forEach(report => {
        expect(report.status).toBe('pending');
      });
    });
  });
});