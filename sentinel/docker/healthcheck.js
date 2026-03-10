// Shared Docker healthcheck script for all SENTINEL services.
// Usage: node docker/healthcheck.js <port>
const port = process.argv[2] || "9091";
fetch(`http://localhost:${port}/health`)
  .then(r => { if (!r.ok) process.exit(1); })
  .catch(() => process.exit(1));
