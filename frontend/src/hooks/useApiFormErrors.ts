import { useCallback, useState } from "react";
import { extractApiError } from "@/api/apiErrors";
import { focusFirstInvalidFieldSoon } from "@/lib/focusFirstInvalid";

/**
 * Standard form error state for the SPA.
 *
 * `apply` turns any API failure into a banner message plus a field map, so a
 * 422 lands next to the input instead of being collapsed into a generic toast.
 * Always call this from a mutation's `onError`; never read `detail` by hand.
 */
export function useApiFormErrors() {
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearField = useCallback((field: string) => {
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setFormError(null);
    setFieldErrors({});
  }, []);

  const apply = useCallback((error: unknown, fallback: string) => {
    const extracted = extractApiError(error, fallback);
    setFormError(extracted.message);
    setFieldErrors(extracted.fields);
    if (Object.keys(extracted.fields).length > 0) focusFirstInvalidFieldSoon();
    return extracted;
  }, []);

  return {
    formError,
    fieldErrors,
    setFormError,
    setFieldErrors,
    clearField,
    clear,
    apply,
  };
}
