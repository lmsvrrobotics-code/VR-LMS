import './src/loadEnv.js';
import app, { initDb } from './src/app.js';

// ASSESSMENT_SERVICE_PORT wins over PORT so this service can share a container
// with the gateway — see the same note in auth-service/index.js. Must match the
// localhost:8003 default in Bastion's serviceMap.
const PORT = process.env.ASSESSMENT_SERVICE_PORT || process.env.PORT || 8003;

initDb().then(async () => {
  app.listen(PORT, () => {
    console.log(`🔐 Assessment Service running on port ${PORT}---`);
  });
}).catch(err => {
  console.error('Failed to init DB:', err);
  process.exit(1);
});
