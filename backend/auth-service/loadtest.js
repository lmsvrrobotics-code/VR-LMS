import http from 'http';
import { performance } from 'perf_hooks';

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';
const CONCURRENT_USERS = parseInt(process.env.CONCURRENT_USERS || '1000');
const REQUESTS_PER_USER = parseInt(process.env.REQUESTS_PER_USER || '10');
const ENDPOINT = process.env.ENDPOINT || '/health';
const TEST_DURATION = parseInt(process.env.TEST_DURATION || '30'); // seconds

console.log(`
🚀 LOAD TEST CONFIGURATION
════════════════════════════════════════
Base URL:       ${BASE_URL}
Concurrent:     ${CONCURRENT_USERS} users
Requests/user:  ${REQUESTS_PER_USER}
Endpoint:       ${ENDPOINT}
Duration:       ${TEST_DURATION}s
════════════════════════════════════════
`);

const stats = {
  totalRequests: 0,
  successRequests: 0,
  failedRequests: 0,
  totalTime: 0,
  responseTimes: [],
  errors: {},
  startTime: 0,
};

function makeRequest() {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const url = new URL(BASE_URL + ENDPOINT);

    const client = url.protocol === 'https:' ? require('https') : http;
    const request = client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const duration = performance.now() - startTime;
        stats.responseTimes.push(duration);
        stats.totalTime += duration;

        if (res.statusCode === 200) {
          stats.successRequests++;
        } else {
          stats.failedRequests++;
          stats.errors[res.statusCode] = (stats.errors[res.statusCode] || 0) + 1;
        }
        stats.totalRequests++;
        resolve();
      });
    });

    request.on('error', (err) => {
      stats.failedRequests++;
      stats.errors[err.code] = (stats.errors[err.code] || 0) + 1;
      stats.totalRequests++;
      resolve();
    });

    request.setTimeout(10000);
  });
}

async function simulateUser() {
  for (let i = 0; i < REQUESTS_PER_USER; i++) {
    await makeRequest();
  }
}

async function runLoadTest() {
  stats.startTime = Date.now();
  console.log(`⏱️  Starting load test at ${new Date().toLocaleTimeString()}`);

  // Start all users concurrently
  const users = [];
  for (let i = 0; i < CONCURRENT_USERS; i++) {
    users.push(simulateUser());
  }

  await Promise.all(users);

  const elapsedTime = (Date.now() - stats.startTime) / 1000;
  const avgResponseTime = stats.totalTime / stats.totalRequests;
  const p95 = percentile(stats.responseTimes, 0.95);
  const p99 = percentile(stats.responseTimes, 0.99);
  const rps = stats.totalRequests / elapsedTime;

  console.log(`
📊 RESULTS
════════════════════════════════════════
Total Requests:     ${stats.totalRequests}
Successful:         ${stats.successRequests} (${(stats.successRequests / stats.totalRequests * 100).toFixed(2)}%)
Failed:             ${stats.failedRequests}
Total Time:         ${elapsedTime.toFixed(2)}s
Requests/sec:       ${rps.toFixed(2)} req/s
Avg Response Time:  ${avgResponseTime.toFixed(2)}ms
P95 Response Time:  ${p95.toFixed(2)}ms
P99 Response Time:  ${p99.toFixed(2)}ms
Min Response Time:  ${Math.min(...stats.responseTimes).toFixed(2)}ms
Max Response Time:  ${Math.max(...stats.responseTimes).toFixed(2)}ms

Errors by Type:
${Object.entries(stats.errors).map(([code, count]) => `  ${code}: ${count}`).join('\n')}
════════════════════════════════════════

✅ PASSED: ${stats.failedRequests === 0 ? 'All requests succeeded!' : `${stats.failedRequests} requests failed`}
`);

  // Exit with appropriate code
  process.exit(stats.failedRequests > 0 ? 1 : 0);
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = arr.sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[idx];
}

runLoadTest().catch(err => {
  console.error('Load test error:', err);
  process.exit(1);
});
