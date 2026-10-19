import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/patterns/EmptyState";

describe("EmptyState", () => {
  it("renders icon, title, hint, and testid", () => {
    render(
      <EmptyState
        testId="empty"
        icon={Inbox}
        title="No messages"
        hint="Nothing arrived yet."
      />,
    );
    const panel = screen.getByTestId("empty");
    expect(panel).toHaveTextContent("No messages");
    expect(panel).toHaveTextContent("Nothing arrived yet.");
    expect(panel.querySelector("svg")).toBeInTheDocument();
  });

  it("defaults to the bordered island with a strong title", () => {
    const { container } = render(<EmptyState title="Empty" />);
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain("rounded-xl");
    expect(panel.className).toContain("border-border");
    expect(panel.className).toContain("bg-muted/40");
    expect(screen.getByText("Empty").className).toContain("text-foreground");
  });

  it("supports the muted title used by ops consoles", () => {
    render(<EmptyState title="Empty" titleTone="muted" />);
    expect(screen.getByText("Empty").className).toContain(
      "text-muted-foreground",
    );
  });

  it("drops the border for bare and keeps a dashed border on request", () => {
    const { container, rerender } = render(
      <EmptyState title="Empty" variant="bare" />,
    );
    expect((container.firstElementChild as HTMLElement).className).not.toContain(
      "border",
    );

    rerender(<EmptyState title="Empty" variant="dashed" />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "border-dashed",
    );
  });

  it("scales the panel by size", () => {
    const { container, rerender } = render(<EmptyState title="Empty" />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "min-h-[8rem]",
    );

    rerender(<EmptyState title="Empty" size="md" />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "min-h-[12rem]",
    );

    rerender(<EmptyState title="Empty" size="lg" />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "min-h-[16rem]",
    );
  });

  it("renders borderless and unpadded for table cells", () => {
    const { container } = render(
      <EmptyState variant="inline" size="none" title="No rows" />,
    );
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).not.toContain("border");
    expect(panel.className).not.toContain("min-h-");
    expect(panel.className).not.toContain("px-");
  });

  it("renders an action node", () => {
    render(
      <EmptyState
        title="Empty"
        action={<button type="button">Create</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });
});
