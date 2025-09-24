// Global test setup
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test timeout
jest.setTimeout(30000);

// Global test helpers
global.testHelpers = {
  createTestUser: (overrides = {}) => ({
    name: 'Test User',
    email: `test${Date.now()}@example.com`,
    password: 'testpassword123',
    role: 'citizen',
    ...overrides
  }),

  createTestReport: (overrides = {}) => ({
    title: 'Test Report',
    description: 'This is a test report for automated testing purposes.',
    category: 'other',
    lat: -26.2041,
    lng: 28.0473,
    address: '123 Test Street, Test City',
    ...overrides
  })
};