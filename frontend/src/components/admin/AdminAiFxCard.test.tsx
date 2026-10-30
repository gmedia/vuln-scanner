import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AiFxStatus } from "@/api/admin";
import { AdminAiFxCard } from "@/components/admin/AdminAiFxCard";

function makeFx(overrides: Partial<AiFxStatus> = {}): AiFxStatus {
  return {
    rate: 16300,
    source: "api.frankfurter.app",
    effective_date: "2026-10-30",
    fetched_at: "2026-10-30T01:10:00Z",
    using_env_fallback: false,
    env_rate: 16000,
    auto_fetch_enabled: true,
    history: [],
    ...overrides,
  };
}

function renderCard(fx: AiFxStatus, overrides: { refreshDisabled?: boolean } = {}) {
  return render(
    <AdminAiFxCard
      fx={fx}
      loading={false}
      refreshing={false}
      saving={false}
      onRefresh={vi.fn()}
      onSaveManual={vi.fn()}
      refreshDisabled={overrides.refreshDisabled ?? false}
    />,
  );
}

describe("AdminAiFxCard", () => {
  it("shows the env fallback note when no rate is stored", () => {
    renderCard(makeFx({ using_env_fallback: true }));
    expect(
      screen.getByText("No stored rate yet — using AI_USD_IDR from env."),
    ).toBeInTheDocument();
  });

  it("shows the auto-off note when daily fetching is disabled", () => {
    renderCard(makeFx({ auto_fetch_enabled: false }), {
      refreshDisabled: true,
    });
    expect(
      screen.getByText(
        "Automatic daily fetch is disabled; only manual updates apply.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeDisabled();
  });

  it("keeps manual save disabled for empty/invalid input and saves a valid rate", async () => {
    const user = userEvent.setup();
    const onSaveManual = vi.fn();
    render(
      <AdminAiFxCard
        fx={makeFx()}
        loading={false}
        refreshing={false}
        saving={false}
        onRefresh={vi.fn()}
        onSaveManual={onSaveManual}
        refreshDisabled={false}
      />,
    );
    const save = screen.getByRole("button", { name: "Save rate" });
    const input = screen.getByLabelText("Manual rate (IDR per 1 USD)");
    expect(save).toBeDisabled();
    await user.type(input, "abc");
    expect(save).toBeDisabled();
    await user.clear(input);
    await user.type(input, "16500");
    expect(save).toBeEnabled();
    await user.click(save);
    expect(onSaveManual).toHaveBeenCalledWith(16500);
  });
});
