import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Shield } from "lucide-react";
import {
  RAILED_CARD_CLASS,
  RAILED_ROW_CLASS,
  RailedNotice,
  RailedShell,
  RailedShellBody,
  RailedShellHead,
} from "@/components/patterns/RailedShell";

const RAIL = "span.absolute.inset-y-2";

describe("RailedShell", () => {
  it("renders the kit card with the rail and testid", () => {
    const { container } = render(
      <RailedShell railClass="bg-primary" testid="shell">
        <p>body</p>
      </RailedShell>,
    );
    const shell = screen.getByTestId("shell");
    expect(shell).toHaveAttribute("data-slot", "card");
    expect(shell.className).toContain("pl-4");
    expect(container.querySelector(RAIL)).toHaveClass("bg-primary");
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("renders a plain framed div without the card slot", () => {
    const { container } = render(
      <RailedShell frame="plain" railClass="bg-border">
        <p>plain</p>
      </RailedShell>,
    );
    const shell = container.firstElementChild as HTMLElement;
    expect(shell).not.toHaveAttribute("data-slot");
    expect(shell.className).toContain("rounded-lg");
    expect(shell.className).toContain("border-border");
    expect(shell.className).toContain("pl-4");
  });

  it("supports an article element for heroes", () => {
    const { container } = render(
      <RailedShell frame="plain" as="article" railClass="bg-primary">
        <p>hero</p>
      </RailedShell>,
    );
    expect(container.firstElementChild?.tagName).toBe("ARTICLE");
  });

  it("applies the wash class", () => {
    const { container } = render(
      <RailedShell railClass="bg-primary" wash="bg-primary/5">
        <p>wash</p>
      </RailedShell>,
    );
    expect(container.firstElementChild?.className).toContain("bg-primary/5");
  });

  it("exposes the canonical class constants", () => {
    expect(RAILED_CARD_CLASS).toContain("pl-4");
    expect(RAILED_ROW_CLASS).toContain("p-3");
    expect(RAILED_ROW_CLASS).toContain("pl-4");
  });
});

describe("RailedShellHead", () => {
  it("renders an icon chip, title, hint, and aside", () => {
    render(
      <RailedShellHead
        icon={Shield}
        iconChip="sm"
        title="Agents"
        hint="fleet"
        aside={<span data-testid="aside" />}
      />,
    );
    expect(screen.getByRole("heading", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByText("fleet")).toBeInTheDocument();
    expect(screen.getByTestId("aside")).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeInTheDocument();
  });

  it("prefers children over the default layout", () => {
    render(
      <RailedShellHead title="ignored">
        <span>custom</span>
      </RailedShellHead>,
    );
    expect(screen.getByText("custom")).toBeInTheDocument();
    expect(screen.queryByText("ignored")).not.toBeInTheDocument();
  });
});

describe("RailedShellBody", () => {
  it("flushes padding on request", () => {
    const { container, rerender } = render(
      <RailedShellBody>content</RailedShellBody>,
    );
    expect(container.firstElementChild?.className).toContain("px-4");

    rerender(<RailedShellBody flush>content</RailedShellBody>);
    expect(container.firstElementChild?.className).toContain("p-0");
  });
});

describe("RailedNotice", () => {
  it("renders the flex layout with role", () => {
    const { container } = render(
      <RailedNotice
        railClass="bg-destructive"
        borderClass="border-destructive/40"
        textClass="text-destructive"
        role="alert"
      >
        broken
      </RailedNotice>,
    );
    const inner = screen.getByRole("alert");
    expect(inner).toHaveTextContent("broken");
    expect(inner.className).toContain("text-destructive");
    expect(container.querySelector(RAIL)).toHaveClass("bg-destructive");
  });

  it("renders the paragraph layout with a content testid", () => {
    render(
      <RailedNotice
        railClass="bg-primary"
        borderClass="border-primary/40"
        textClass="text-foreground"
        layout="paragraph"
        contentTestid="notice-body"
      >
        note
      </RailedNotice>,
    );
    expect(screen.getByTestId("notice-body").tagName).toBe("P");
  });
});
