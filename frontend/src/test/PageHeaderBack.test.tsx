import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import PageHeaderBack from "@/components/layout/PageHeaderBack";

describe("PageHeaderBack", () => {
  it("renders an accessible link for child pages", () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="Scan details"
          leading={<PageHeaderBack to="/dashboard" label="Back to dashboard" />}
        />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Back to dashboard" });
    expect(link).toHaveAttribute("href", "/dashboard");
  });
});
