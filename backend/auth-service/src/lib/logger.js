/**
 * ✅ LIGHTWEIGHT LOGGER
 * Minimal structured logger backed by console. Kept dependency-free so the
 * auth-service can start without pulling in a heavier logging stack.
 * Each method accepts a message plus an optional structured-context object.
 */

function emit(level, consoleFn, message, meta) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta && typeof meta === 'object' ? meta : {}),
  };
  consoleFn(JSON.stringify(entry));
}

const logger = {
  info: (message, meta) => emit('info', console.log, message, meta),
  warn: (message, meta) => emit('warn', console.warn, message, meta),
  error: (message, meta) => emit('error', console.error, message, meta),
  debug: (message, meta) => emit('debug', console.debug, message, meta),
};

export default logger;
