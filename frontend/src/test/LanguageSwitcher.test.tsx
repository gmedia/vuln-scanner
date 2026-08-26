import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import i18n from "@/i18n";

describe("LanguageSwitcher", () => {
  afterEach(() => {
    void i18n.changeLanguage("en");
  });

  it("toggles locale and restores en for tests", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);
    const group = screen.getByTestId("language-switcher");
    expect(group).toBeInTheDocument();
    expect(group.className).toMatch(/overflow-hidden/);
    expect(group.className).toMatch(/h-11/);
    await user.click(screen.getByTestId("locale-id"));
    expect(i18n.language).toBe("id");
    await user.click(screen.getByTestId("locale-en"));
    expect(i18n.language).toBe("en");
  });
});
