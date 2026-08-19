import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePicker } from "@/components/ui/DatePicker";

describe("DatePicker", () => {
  it("renders placeholder when empty", () => {
    render(<DatePicker value="" onChange={() => {}} placeholder="From date" />);
    expect(
      screen.getByRole("button", { name: /from date/i }),
    ).toBeInTheDocument();
  });

  it("shows formatted date when value is set", () => {
    render(
      <DatePicker value="2024-01-15" onChange={() => {}} aria-label="From" />,
    );
    expect(screen.getByRole("button", { name: "From" })).toHaveTextContent(
      /Jan 15, 2024/,
    );
  });

  it("opens calendar popover on click", async () => {
    const user = userEvent.setup();
    render(<DatePicker value="" onChange={() => {}} aria-label="Pick" />);
    await user.click(screen.getByRole("button", { name: "Pick" }));
    expect(document.querySelector(".rdp-root")).toBeTruthy();
  });

  it("keeps month nav buttons inside the calendar root", async () => {
    const user = userEvent.setup();
    render(
      <DatePicker value="2026-08-06" onChange={() => {}} aria-label="Pick" />,
    );
    await user.click(screen.getByRole("button", { name: "Pick" }));
    const root = document.querySelector(".rdp-root");
    expect(root).toBeTruthy();
    const prev = document.querySelector("button.rdp-button_previous");
    const next = document.querySelector("button.rdp-button_next");
    expect(prev).toBeTruthy();
    expect(next).toBeTruthy();
    expect(root!.contains(prev)).toBe(true);
    expect(root!.contains(next)).toBe(true);
    expect(prev).toHaveClass("size-7");
    expect(next).toHaveClass("size-7");
    expect(prev).toHaveClass("absolute");
    expect(next).toHaveClass("absolute");
    expect(prev).toHaveClass("left-1");
    expect(next).toHaveClass("right-1");
  });

  it("calls onChange with empty string when cleared", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DatePicker value="2024-01-15" onChange={onChange} aria-label="From" />,
    );
    await user.click(screen.getByRole("button", { name: "From" }));
    const clear = await screen.findByRole("button", { name: /clear date/i });
    await user.click(clear);
    expect(onChange).toHaveBeenCalledWith("");
  });
});
