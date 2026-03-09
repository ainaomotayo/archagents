/**
 * k6 load test simulating concurrent scan submissions and result polling.
 *
 * Run:  k6 run k6-scan-load.js --env BASE_URL=http://localhost:3000
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const scanDuration = new Trend("scan_duration");
const scanSuccess = new Rate("scan_success");

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  scenarios: {
    scan_submissions: {
      executor: "constant-vus",
      vus: 100,
      duration: "5m",
      exec: "submitScan",
    },
    poll_results: {
      executor: "constant-vus",
      vus: 50,
      duration: "5m",
      startTime: "30s",
      exec: "pollResults",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<2000"], // 95th percentile under 2s
    http_req_failed: ["rate<0.01"], // <1% error rate
    checks: ["rate>0.99"], // >99% checks pass
    scan_success: ["rate>0.95"],
  },
};

const REPOS = [
  "acme/frontend",
  "acme/backend",
  "acme/infra",
  "acme/data-pipeline",
  "acme/mobile-app",
];

function randomRepo() {
  return REPOS[Math.floor(Math.random() * REPOS.length)];
}

function randomSha() {
  const chars = "0123456789abcdef";
  let sha = "";
  for (let i = 0; i < 40; i++) {
    sha += chars[Math.floor(Math.random() * chars.length)];
  }
  return sha;
}

export function submitScan() {
  const payload = JSON.stringify({
    repository: randomRepo(),
    commitSha: randomSha(),
    ref: "refs/heads/main",
    diff: `--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,3 +1,5 @@\n+import { something } from 'new-dep';\n const x = 1;\n+const secret = process.env.API_KEY;\n const y = 2;`,
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    },
    tags: { name: "submit_scan" },
  };

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/scans`, payload, params);
  const elapsed = Date.now() - start;

  scanDuration.add(elapsed);

  const passed = check(res, {
    "submit status is 201 or 202": (r) =>
      r.status === 201 || r.status === 202,
    "submit returns scan id": (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.scanId || !!body.id;
      } catch {
        return false;
      }
    },
    "submit response time < 2s": (r) => r.timings.duration < 2000,
  });

  scanSuccess.add(passed ? 1 : 0);
  sleep(Math.random() * 2 + 0.5);
}

export function pollResults() {
  // Submit a scan first to get an ID to poll
  const submitPayload = JSON.stringify({
    repository: randomRepo(),
    commitSha: randomSha(),
    ref: "refs/heads/main",
    diff: "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1,2 @@\n+// comment",
  });

  const submitParams = {
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    },
    tags: { name: "poll_submit" },
  };

  const submitRes = http.post(
    `${BASE_URL}/api/v1/scans`,
    submitPayload,
    submitParams,
  );

  let scanId;
  try {
    const body = JSON.parse(submitRes.body);
    scanId = body.scanId || body.id;
  } catch {
    sleep(1);
    return;
  }

  if (!scanId) {
    sleep(1);
    return;
  }

  // Poll up to 10 times
  const pollParams = {
    headers: { Authorization: "Bearer test-token" },
    tags: { name: "poll_result" },
  };

  for (let i = 0; i < 10; i++) {
    const res = http.get(`${BASE_URL}/api/v1/scans/${scanId}`, pollParams);

    const isComplete = check(res, {
      "poll status is 200": (r) => r.status === 200,
      "poll response time < 1s": (r) => r.timings.duration < 1000,
    });

    try {
      const body = JSON.parse(res.body);
      if (body.status === "completed" || body.status === "failed") {
        check(res, {
          "scan completed with result": () =>
            body.status === "completed" || body.status === "failed",
        });
        break;
      }
    } catch {
      // ignore parse errors
    }

    sleep(2);
  }

  sleep(Math.random() * 3 + 1);
}

export default function () {
  submitScan();
}
