// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { EmptyState } from "../empty-state";
import { IconFolder } from "../icons";

afterEach(cleanup);

describe("EmptyState", () => {
  it("renders headline", () => {
    render(<EmptyState icon={IconFolder} headline="No projects yet" />);
    expect(screen.getByText("No projects yet")).toBeDefined();
  });

  it("renders body text when provided", () => {
    render(<EmptyState icon={IconFolder} headline="No data" body="Add something to get started." />);
    expect(screen.getByText("Add something to get started.")).toBeDefined();
  });

  it("does not render body when not provided", () => {
    render(<EmptyState icon={IconFolder} headline="No data" />);
    expect(screen.queryByText(/get started/i)).toBeNull();
  });

  it("renders CTA link when provided", () => {
    render(
      <EmptyState
        icon={IconFolder}
        headline="No projects"
        cta={{ label: "Add project", href: "/settings/vcs" }}
      />
    );
    const link = screen.getByRole("link", { name: /add project/i });
    expect(link).toBeDefined();
    expect((link as HTMLAnchorElement).getAttribute("href")).toBe("/settings/vcs");
  });

  it("does not render CTA when not provided", () => {
    render(<EmptyState icon={IconFolder} headline="No data" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("applies success variant — uses border-status-pass/20 class", () => {
    const { container } = render(
      <EmptyState icon={IconFolder} headline="All clear" variant="success" />
    );
    expect((container.firstChild as HTMLElement).className).toContain("border-status-pass/20");
  });

  it("applies default variant — uses border-border class", () => {
    const { container } = render(<EmptyState icon={IconFolder} headline="No data" />);
    expect((container.firstChild as HTMLElement).className).toContain("border-border");
  });
});
