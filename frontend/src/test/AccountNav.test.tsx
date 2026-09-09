import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AccountNav from "@/components/layout/AccountNav";

describe("AccountNav", () => {
  it("renders profile, workspace, and credit links", () => {
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <AccountNav />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("account-nav")).toBeInTheDocument();
    expect(screen.getByTestId("account-nav-profile")).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByTestId("account-nav-workspace")).toHaveAttribute(
      "href",
      "/settings/workspace",
    );
    expect(screen.getByTestId("account-nav-credits")).toHaveAttribute(
      "href",
      "/credit-history",
    );
  });
});
