/**
 * SENTINEL Demo Data
 *
 * Re-exports all mock data behind the DEMO_MODE flag.
 * Only use this in demo docker-compose configurations with DEMO_MODE=true.
 * Never import this in production code.
 */
export const DEMO_MODE = process.env.DEMO_MODE === "true";

export * from "./mock-data";
export {
  MOCK_ITEMS as DEMO_REMEDIATION_ITEMS,
  MOCK_STATS as DEMO_REMEDIATION_STATS,
} from "./remediation-mock-data";
