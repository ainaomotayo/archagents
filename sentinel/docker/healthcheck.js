const http = require("http");
const port = process.env.HEALTH_PORT || process.env.PORT || 8080;
const path = process.env.HEALTH_PATH || "/health";
const req = http.get(`http://localhost:${port}${path}`, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on("error", () => process.exit(1));
req.setTimeout(3000, () => { req.destroy(); process.exit(1); });
