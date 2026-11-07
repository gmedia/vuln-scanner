import { useEffect } from "react";

/**
 * Move focus to the first control marked `aria-invalid` so a keyboard or
 * screen-reader user lands on the field the server rejected. Forms set that
 * attribute from `fieldErrors`, so no per-form id mapping is needed.
 */
export function focusFirstInvalidField(root?: ParentNode): void {
  if (typeof document === "undefined") return;
  const scope = root ?? document;
  scope.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}

function soon(callback: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
  } else {
    setTimeout(callback, 0);
  }
}

/** Focus after React commits the new `aria-invalid` attributes. */
export function focusFirstInvalidFieldSoon(): void {
  if (typeof document === "undefined") return;
  soon(() => focusFirstInvalidField());
}

/** Focuses when the field-error set changes (including a new message). */
export function useFocusFirstInvalidField(
  fieldErrors: Record<string, unknown>,
): void {
  const signature = Object.entries(fieldErrors)
    .map(([field, message]) => `${field}:${String(message)}`)
    .sort()
    .join("|");

  useEffect(() => {
    if (!signature) return;
    focusFirstInvalidFieldSoon();
  }, [signature]);
}
