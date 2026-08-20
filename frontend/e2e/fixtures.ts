import { test as base, expect, type Page } from "@playwright/test";
import { e2eEmail, e2ePassword } from "./credentials";

type TokenPair = { accessToken: string; refreshToken?: string };

let cachedTokens: TokenPair | null = null;
let inflight: Promise<TokenPair> | null = null;

async function fetchTokens(page: Page): Promise<TokenPair> {
  const baseURL = process.env.BASE_URL || "http://localhost";
  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const loginRes = await page.request.post(`${baseURL}/api/auth/login`, {
      data: {
        email: e2eEmail(),
        password: e2ePassword(),
      },
    });
    lastStatus = loginRes.status();
    lastBody = await loginRes.text();
    if (loginRes.status() === 200) {
      const loginData = JSON.parse(lastBody) as {
        access_token?: string;
        refresh_token?: string;
      };
      if (!loginData.access_token) {
        throw new Error("E2E re-login missing access_token");
      }
      return {
        accessToken: loginData.access_token,
        refreshToken: loginData.refresh_token,
      };
    }
    if (loginRes.status() !== 429) {
      break;
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`E2E re-login failed: ${lastStatus} ${lastBody}`);
}

export async function ensureLoggedIn(page: Page): Promise<void> {
  if (!cachedTokens) {
    inflight ??= fetchTokens(page);
    try {
      cachedTokens = await inflight;
    } finally {
      inflight = null;
    }
  }
  const tokens = cachedTokens;
  await page.addInitScript(
    ({
      accessToken: at,
      refreshToken: rt,
    }: {
      accessToken: string;
      refreshToken?: string;
    }) => {
      window.localStorage.setItem("accessToken", at);
      window.localStorage.setItem("sinexis.locale", "id");
      if (rt) {
        window.localStorage.setItem("refreshToken", rt);
      }
    },
    tokens,
  );
}

export const test = base.extend<{ skipAuth: boolean }>({
  skipAuth: [false, { option: true }],
  page: async ({ page, skipAuth }, use) => {
    if (!skipAuth) {
      await ensureLoggedIn(page);
    }
    await use(page);
  },
});

export { expect };
