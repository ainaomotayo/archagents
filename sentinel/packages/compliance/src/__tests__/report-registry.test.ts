import { describe, it, expect, beforeEach } from "vitest";
import { ReportRegistry, type ReportTemplate } from "../reports/registry.js";

const fakeTemplate: ReportTemplate<{ x: number }> = {
  type: "test_report",
  displayName: "Test Report",
  description: "A test report",
  gather: async () => ({ x: 42 }),
  render: () => null as any,
};

describe("ReportRegistry", () => {
  let registry: ReportRegistry;

  beforeEach(() => {
    registry = new ReportRegistry();
  });

  it("registers and retrieves a template", () => {
    registry.register(fakeTemplate);
    expect(registry.get("test_report")).toBe(fakeTemplate);
  });

  it("returns undefined for unknown type", () => {
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("lists all registered templates", () => {
    registry.register(fakeTemplate);
    const list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe("test_report");
  });

  it("throws on duplicate registration", () => {
    registry.register(fakeTemplate);
    expect(() => registry.register(fakeTemplate)).toThrow("already registered");
  });

  it("has() returns true for registered type", () => {
    registry.register(fakeTemplate);
    expect(registry.has("test_report")).toBe(true);
    expect(registry.has("nope")).toBe(false);
  });
});
