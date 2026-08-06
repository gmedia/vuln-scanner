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
