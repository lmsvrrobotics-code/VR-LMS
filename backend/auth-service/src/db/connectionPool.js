// Database connection pool configuration for handling 1k+ concurrent users
// Pool size should be: 5-10 min connections, 20-30 max for 1k concurrent

export const POOL_CONFIG = {
  max: 30,           // Max connections in pool (1k concurrent ÷ ~30-50 = 20-30 ideal)
  min: 5,            // Min connections kept alive
  acquire: 30000,    // ms to wait for connection (30 sec timeout)
  idle: 10000,       // ms before idle connection released (10 sec)
  evict: 5000,       // Check every 5 sec for idle connections
};

export const SEQUELIZE_POOL_CONFIG = {
  ...POOL_CONFIG,
  // Sequelize-specific
  handleDisconnects: true,
  logQueryParameters: false,
};

// Connection pool for direct pg client
export function getPoolConfig() {
  return {
    max: 30,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 30000,
    statement_timeout: 30000,
    query_timeout: 30000,
  };
}
