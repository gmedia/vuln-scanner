import { describe, it, expect, beforeEach } from "vitest";
import {
  captureInviteFromSearch,
  clearInviteToken,
  isInviteToken,
  persistInviteToken,
  postAuthPath,
  publicInviteUrl,
  readInviteToken,
  workspaceInvitePath,
} from "@/lib/inviteToken";

describe("inviteToken", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("rejects short or junk tokens", () => {
    expect(isInviteToken("abc")).toBe(false);
    expect(isInviteToken("not a token!!")).toBe(false);
    expect(isInviteToken(null)).toBe(false);
  });

  it("persists and reads a valid token", () => {
    persistInviteToken("abcdefgh");
    expect(readInviteToken()).toBe("abcdefgh");
    clearInviteToken();
    expect(readInviteToken()).toBeNull();
  });

  it("captures invite from search and sets post-auth path", () => {
    const token = "inviteTok_12";
    expect(captureInviteFromSearch(`invite=${token}`)).toBe(token);
    expect(postAuthPath()).toBe(
      `/settings/workspace?invite=${encodeURIComponent(token)}`,
    );
    expect(workspaceInvitePath()).toContain(token);
  });

  it("builds a public invite URL", () => {
    expect(publicInviteUrl("abcdefgh")).toContain(
      "/settings/workspace?invite=abcdefgh",
    );
  });
});
