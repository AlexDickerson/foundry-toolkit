// Re-export the server's load-env side-effect so CLI scripts can share the
// same .env discovery logic without duplicating it.
export * from '../server/load-env.js';
