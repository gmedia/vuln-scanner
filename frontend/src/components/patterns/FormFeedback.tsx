import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/** Error banner shared by every form surface. Renders nothing when empty. */
export function FormAlert({
  message,
  title,
  className,
}: {
  readonly message?: string | null;
  readonly title?: string;
  readonly className?: string;
}) {
  const { t } = useTranslation("common");
  if (!message) return null;
  return (
    <Alert variant="destructive" className={cn(className)}>
      <AlertCircle className="size-4" />
      <AlertTitle>{title ?? t("formErrorTitle")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** One field-level server error, e.g. `detail[].loc` mapped to `email`. */
export function FieldError({
  id,
  message,
}: {
  readonly id?: string;
  readonly message?: string | null;
}) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}
