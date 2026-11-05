import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiErrorCode, apiErrorMessage, apiErrorParams } from "@/api/apiErrors";
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
});
