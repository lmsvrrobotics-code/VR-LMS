// K6 Load Test Script
// Install: npm install -g k6
// Run: k6 run loadtest.k6.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:8001';
const endpoint = __ENV.ENDPOINT || '/health';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('http_req_duration');
const successRequests = new Counter('success_requests');
const failedRequests = new Counter('failed_requests');
const activeUsers = new Gauge('active_users');

export const options = {
  stages: [
    { duration: '5s', target: 100 },    // Ramp-up to 100 users
    { duration: '10s', target: 500 },   // Scale to 500 users
    { duration: '10s', target: 1000 },  // Peak: 1000 concurrent users
    { duration: '10s', target: 500 },   // Scale down to 500
    { duration: '5s', target: 0 },      // Cool down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'errors': ['rate<0.1'],  // Error rate < 10%
  },
  ext: {
    loadimpact: {
      projectID: 1234,
      name: 'Mission Impossible Load Test'
    }
  }
};

export default function () {
  activeUsers.add(__VU);

  const url = `${baseUrl}${endpoint}`;
  const response = http.get(url);

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (success) {
    successRequests.add(1);
  } else {
    failedRequests.add(1);
    errorRate.add(1);
  }

  responseTime.add(response.timings.duration);

  sleep(0.1);
}
