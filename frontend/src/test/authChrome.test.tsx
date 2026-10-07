import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckCircle, XCircle } from "lucide-react";
import {
  AuthCard,
  AuthCardBody,
  AuthNotice,
  AuthStatusIcon,
} from "@/components/auth/AuthCard";
import { authRailClass, authWashClass } from "@/components/auth/authChrome";

describe("authChrome helpers", () => {
  it("maps tones to rail classes", () => {
    expect(authRailClass("danger")).toBe("bg-destructive");
    expect(authRailClass("warn")).toBe("bg-amber-500");
    expect(authRailClass("info")).toBe("bg-sky-500");
    expect(authRailClass("primary")).toBe("bg-primary");
    expect(authRailClass("success")).toBe("bg-primary");
  });

  it("maps tones to washes", () => {
    expect(authWashClass("danger")).toBe("bg-destructive/[0.04]");
    expect(authWashClass("warn")).toBe("bg-amber-500/[0.04]");
    expect(authWashClass("success")).toBe("bg-primary/5");
    expect(authWashClass("info")).toBeUndefined();
  });
});

describe("AuthCard", () => {
  it("renders the rail shell with the frozen card class", () => {
    const { container } = render(
      <AuthCard tone="danger">
        <AuthCardBody>body</AuthCardBody>
      </AuthCard>,
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card).not.toBeNull();
    expect(card?.className).toMatch(/border-border\/80/);
    expect(card?.className).toMatch(/shadow-none/);
    expect(card?.className).toMatch(/pl-4/);
    expect(card?.querySelector(".bg-destructive")).toBeTruthy();
    expect(card?.className).toMatch(/bg-destructive\/\[0\.04\]/);
  });

  it("uses the primary rail for a neutral card", () => {
    const { container } = render(
      <AuthCard>
        <AuthCardBody>body</AuthCardBody>
      </AuthCard>,
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card?.querySelector(".bg-primary")).toBeTruthy();
  });
});

describe("AuthNotice", () => {
  it("keeps the destructive notice on text-red-400 with a role", () => {
    render(
      <AuthNotice tone="danger" role="alert">
        Bad credentials
      </AuthNotice>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Bad credentials");
    expect(alert.className).toMatch(/text-red-400/);
    expect(alert.parentElement?.querySelector(".bg-destructive")).toBeTruthy();
  });

  it("renders a success notice on the primary rail", () => {
    render(<AuthNotice tone="success">Sent</AuthNotice>);
    const text = screen.getByText("Sent");
    expect(text.className).toMatch(/text-primary/);
    expect(text.parentElement?.querySelector(".bg-primary")).toBeTruthy();
  });
});

describe("AuthStatusIcon", () => {
  it("colors a success icon primary inside a chip", () => {
    const { container } = render(
      <AuthStatusIcon icon={CheckCircle} tone="success" />,
    );
    const chip = container.querySelector("span");
    expect(chip?.className).toMatch(/h-12 w-12/);
    expect(chip?.querySelector("svg")?.getAttribute("class")).toMatch(
      /text-primary/,
    );
  });

  it("colors an error icon destructive", () => {
    const { container } = render(
      <AuthStatusIcon icon={XCircle} tone="danger" />,
    );
    expect(container.querySelector("svg")?.getAttribute("class")).toMatch(
      /text-destructive/,
    );
  });

  it("spins the icon when requested", () => {
    const { container } = render(
      <AuthStatusIcon icon={CheckCircle} tone="info" spin />,
    );
    expect(container.querySelector("svg")?.getAttribute("class")).toMatch(
      /animate-spin/,
    );
  });
});
