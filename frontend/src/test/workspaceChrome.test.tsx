import { describe, it, expect } from "vitest";
import {
  countTone,
  formTone,
  invoiceListTone,
  invoiceTone,
  roleTone,
  workspaceRailClass,
  workspaceWashClass,
} from "@/components/workspace/workspaceChrome";

describe("workspaceChrome helpers", () => {
  it("maps tones to rail classes", () => {
    expect(workspaceRailClass("danger")).toBe("bg-destructive");
    expect(workspaceRailClass("warn")).toBe("bg-amber-500");
    expect(workspaceRailClass("info")).toBe("bg-sky-500");
    expect(workspaceRailClass("idle")).toBe("bg-border");
    expect(workspaceRailClass("primary")).toBe("bg-primary");
    expect(workspaceRailClass("success")).toBe("bg-primary");
  });

  it("maps tones to washes", () => {
    expect(workspaceWashClass("danger")).toBe("bg-destructive/[0.04]");
    expect(workspaceWashClass("warn")).toBe("bg-amber-500/[0.04]");
    expect(workspaceWashClass("success")).toBe("bg-primary/5");
    expect(workspaceWashClass("primary")).toBeUndefined();
    expect(workspaceWashClass("idle")).toBeUndefined();
  });

  it("maps roles to tones", () => {
    expect(roleTone("owner")).toBe("primary");
    expect(roleTone("admin")).toBe("success");
    expect(roleTone("member")).toBe("info");
    expect(roleTone("viewer")).toBe("idle");
  });

  it("maps invoice status to tones", () => {
    expect(invoiceTone("paid")).toBe("success");
    expect(invoiceTone("sent")).toBe("warn");
    expect(invoiceTone("void")).toBe("danger");
    expect(invoiceTone("draft")).toBe("idle");
  });

  it("derives the invoice list tone with void > sent > paid precedence", () => {
    expect(invoiceListTone([])).toBe("idle");
    expect(invoiceListTone(["paid"])).toBe("success");
    expect(invoiceListTone(["paid", "sent"])).toBe("warn");
    expect(invoiceListTone(["paid", "sent", "void"])).toBe("danger");
    expect(invoiceListTone(["draft"])).toBe("idle");
  });

  it("derives count and form tones", () => {
    expect(countTone(0)).toBe("idle");
    expect(countTone(undefined)).toBe("idle");
    expect(countTone(3)).toBe("primary");
    expect(formTone({ error: false, pending: false })).toBe("primary");
    expect(formTone({ error: false, pending: true })).toBe("info");
    expect(formTone({ error: true, pending: false })).toBe("danger");
    expect(formTone({ error: true, pending: true })).toBe("danger");
  });
});
