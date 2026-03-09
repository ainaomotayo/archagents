import { describe, it, expect, afterEach } from "vitest";
import { getCloudProvider } from "../cloud-factory.js";

describe("getCloudProvider", () => {
  afterEach(() => { delete process.env.CLOUD_PROVIDER; });

  it("returns null when CLOUD_PROVIDER is not set", () => {
    delete process.env.CLOUD_PROVIDER;
    expect(getCloudProvider()).toBeNull();
  });

  it("returns 'aws' for AWS", () => {
    process.env.CLOUD_PROVIDER = "aws";
    expect(getCloudProvider()).toBe("aws");
  });

  it("returns 'gcp' for GCP (case insensitive)", () => {
    process.env.CLOUD_PROVIDER = "GCP";
    expect(getCloudProvider()).toBe("gcp");
  });

  it("returns 'azure' for Azure", () => {
    process.env.CLOUD_PROVIDER = "azure";
    expect(getCloudProvider()).toBe("azure");
  });

  it("returns null for unknown provider", () => {
    process.env.CLOUD_PROVIDER = "oracle";
    expect(getCloudProvider()).toBeNull();
  });
});
