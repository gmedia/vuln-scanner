import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  apiErrorCode,
  apiErrorMessage,
  apiErrorParams,
  extractApiError,
  fieldPath,
} from "@/api/apiErrors";
import i18n from "@/i18n";
import { DEFAULT_LOCALE } from "@/i18n/locales";

function httpError(data: unknown) {
  return { response: { status: 400, data } };
}

describe("api error messages", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterAll(async () => {
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });

  it("translates a known code and interpolates params", () => {
    const error = httpError({
      code: "uptime_seat_limit",
      params: { tier: "starter", limit: 10 },
      detail: "English detail from the server",
    });

    expect(apiErrorMessage(error, "fallback")).toBe(
      "The starter plan allows 10 uptime monitors. Disable one or upgrade to add another.",
    );
  });

  it("falls back to the server detail for an unknown code", () => {
    const error = httpError({ code: "not_a_real_code", detail: "Server said no" });

    expect(apiErrorMessage(error, "fallback")).toBe("Server said no");
  });

  it("falls back when there is no response body", () => {
    expect(apiErrorMessage(new Error("network down"), "fallback")).toBe("fallback");
    expect(apiErrorMessage(undefined, "fallback")).toBe("fallback");
  });

  it("reads code and params defensively", () => {
    expect(apiErrorCode(httpError({ code: "" }))).toBeUndefined();
    expect(apiErrorCode(httpError({ code: 42 }))).toBeUndefined();
    expect(apiErrorParams(httpError({ params: "nope" }))).toEqual({});
    expect(apiErrorParams(httpError({ params: { limit: 3 } }))).toEqual({ limit: 3 });
  });

  it("renders a raw FastAPI 422 detail array per field", () => {
    const error = httpError({
      detail: [
        {
          type: "missing",
          loc: ["body", "email"],
          msg: "Field required",
        },
        {
          type: "string_too_short",
          loc: ["body", "password"],
          msg: "String should have at least 8 characters",
          ctx: { min_length: 8 },
        },
      ],
    });

    const extracted = extractApiError(error, "fallback");
    expect(extracted.message).toBe("This field is required.; Must be at least 8 characters.");
    expect(extracted.fields).toEqual({
      email: "This field is required.",
      password: "Must be at least 8 characters.",
    });
    expect(extracted.message).not.toContain("[object Object]");
  });

  it("renders the normalized validation envelope and localizes custom types", () => {
    const error = httpError({
      detail: "Password must contain at least one uppercase letter",
      code: "validation_error",
      params: {},
      fields: { password: "Password must contain at least one uppercase letter" },
      errors: [
        {
          field: "password",
          msg: "Password must contain at least one uppercase letter",
          type: "password_uppercase",
        },
      ],
    });

    const extracted = extractApiError(error, "fallback");
    expect(extracted.message).toBe(
      "Password must contain at least one uppercase letter.",
    );
    expect(extracted.fields).toEqual({
      password: "Password must contain at least one uppercase letter.",
    });
  });

  it("keeps the specific server message for value_error", () => {
    const error = httpError({
      detail: "tax_id must be 16 digits (NPWP)",
      code: "validation_error",
      fields: { tax_id: "tax_id must be 16 digits (NPWP)" },
      errors: [
        {
          field: "tax_id",
          msg: "tax_id must be 16 digits (NPWP)",
          type: "value_error",
        },
      ],
    });

    expect(apiErrorMessage(error, "fallback")).toBe(
      "tax_id must be 16 digits (NPWP)",
    );
  });

  it("maps nested loc paths", () => {
    expect(fieldPath(["body", "findings", 0, "class"])).toBe(
      "findings[0].class",
    );
    expect(fieldPath(["query", "limit"])).toBe("limit");
    expect(fieldPath(["body"])).toBe("");
    expect(fieldPath(undefined)).toBe("");
  });

  it("does not let validation_error hide the field message", () => {
    const error = httpError({
      detail: "Password must contain at least one digit",
      code: "validation_error",
      errors: [
        {
          field: "password",
          msg: "Password must contain at least one digit",
          type: "password_digit",
        },
      ],
    });

    expect(apiErrorMessage(error, "fallback")).toBe(
      "Password must contain at least one digit.",
    );
  });
});
