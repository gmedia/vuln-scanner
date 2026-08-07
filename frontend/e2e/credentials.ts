export function e2eEmail(): string {
  return process.env.E2E_EMAIL?.trim() || "e2e@vulnscan.dev";
}

export function e2ePassword(): string {
  const password = process.env.E2E_PASSWORD?.trim();
  if (!password) {
    throw new Error(
      "E2E_PASSWORD is required (do not hardcode credentials). " +
        "Export it in the shell or CI secrets, then re-run.",
    );
  }
  return password;
}
