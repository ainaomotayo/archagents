// tests/e2e/fixtures/diffs.ts
import type { DiffPayload } from "../services/scan-service.js";

const BASE_CONFIG = {
  scanConfig: {
    securityLevel: "strict" as const,
    licensePolicy: "default",
    qualityThreshold: 80,
  },
};

export function securityVulnDiff(projectId: string): DiffPayload {
  return {
    projectId,
    commitHash: `e2e-sec-${Date.now()}`,
    branch: "e2e-test",
    author: "e2e-bot",
    timestamp: new Date().toISOString(),
    files: [
      {
        path: "src/db.ts",
        language: "typescript",
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 5,
            content: [
              "+import { query } from './pool';",
              "+export function getUser(userId: string) {",
              "+  return query(`SELECT * FROM users WHERE id = '${userId}'`);",
              "+}",
              "+const API_KEY = 'sk-live-hardcoded-secret-12345';",
            ].join("\n"),
          },
        ],
        aiScore: 0,
      },
    ],
    ...BASE_CONFIG,
  };
}

export function dependencyVulnDiff(projectId: string): DiffPayload {
  return {
    projectId,
    commitHash: `e2e-dep-${Date.now()}`,
    branch: "e2e-test",
    author: "e2e-bot",
    timestamp: new Date().toISOString(),
    files: [
      {
        path: "package.json",
        language: "json",
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 8,
            content: [
              '+{',
              '+  "name": "e2e-test-app",',
              '+  "dependencies": {',
              '+    "lodash": "4.17.20",',
              '+    "express": "4.17.1"',
              '+  }',
              '+}',
            ].join("\n"),
          },
        ],
        aiScore: 0,
      },
    ],
    ...BASE_CONFIG,
  };
}

export function combinedVulnDiff(projectId: string): DiffPayload {
  const sec = securityVulnDiff(projectId);
  const dep = dependencyVulnDiff(projectId);
  return {
    ...sec,
    commitHash: `e2e-combined-${Date.now()}`,
    files: [...sec.files, ...dep.files],
  };
}

export function cleanDiff(projectId: string): DiffPayload {
  return {
    projectId,
    commitHash: `e2e-clean-${Date.now()}`,
    branch: "e2e-test",
    author: "e2e-bot",
    timestamp: new Date().toISOString(),
    files: [
      {
        path: "src/utils.ts",
        language: "typescript",
        hunks: [
          {
            oldStart: 1,
            oldCount: 0,
            newStart: 1,
            newCount: 3,
            content: [
              "+export function add(a: number, b: number): number {",
              "+  return a + b;",
              "+}",
            ].join("\n"),
          },
        ],
        aiScore: 0,
      },
    ],
    ...BASE_CONFIG,
  };
}
