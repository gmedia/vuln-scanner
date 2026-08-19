import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTimePicker } from "@/components/ui/DateTimePicker";

describe("DateTimePicker", () => {
  it("renders placeholder when empty", () => {
    render(
      <DateTimePicker value="" onChange={() => {}} aria-label="Sejak" />,
    );
    expect(screen.getByRole("button", { name: "Sejak" })).toBeInTheDocument();
  });

  it("shows dd/MM/yyyy HH:mm when value is set", () => {
    render(
      <DateTimePicker
        value="2026-08-06T14:30"
        onChange={() => {}}
        aria-label="Sejak"
      />,
    );
    expect(screen.getByRole("button", { name: "Sejak" })).toHaveTextContent(
      "06/08/2026 14:30",
    );
  });

  it("opens calendar and 24h hour/minute selects", async () => {
    const user = userEvent.setup();
    render(
      <DateTimePicker value="" onChange={() => {}} aria-label="Sejak" />,
    );
    await user.click(screen.getByRole("button", { name: "Sejak" }));
    expect(document.querySelector(".rdp-root")).toBeTruthy();
    expect(screen.getByLabelText("Jam (24 jam)")).toBeInTheDocument();
    expect(screen.getByLabelText("Menit")).toBeInTheDocument();
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });

  it("clears value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateTimePicker
        value="2026-08-06T14:30"
        onChange={onChange}
        aria-label="Sejak"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Sejak" }));
    await user.click(screen.getByRole("button", { name: "Hapus" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
