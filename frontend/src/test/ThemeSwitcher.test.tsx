import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";
import { THEME_STORAGE_KEY, applyTheme } from "@/theme/theme";

describe("ThemeSwitcher", () => {
  afterEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    applyTheme("dark");
  });

  it("toggles html.dark and persists sinexis.theme", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);
    expect(screen.getByTestId("theme-switcher")).toBeInTheDocument();
    await user.click(screen.getByTestId("theme-light"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    await user.click(screen.getByTestId("theme-dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});
