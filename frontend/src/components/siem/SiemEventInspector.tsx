import type { SiemEvent } from "@/api/siem";
import { SiemEventDetail } from "@/components/siem/SiemEventDetail";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { TableRowSkeleton } from "@/components/ui/Skeleton";

type Translate = (key: string) => string;

export function SiemEventInspector({
  loading,
  selected,
  canCreate,
  caseTitle,
  onCaseTitleChange,
  createPending,
  onCreateCase,
  t,
}: {
  readonly loading: boolean;
  readonly selected: SiemEvent | null;
  readonly canCreate: boolean;
  readonly caseTitle: string;
  readonly onCaseTitleChange: (value: string) => void;
  readonly createPending: boolean;
  readonly onCreateCase: () => void;
  readonly t: Translate;
}) {
  const shell =
    "xl:sticky xl:top-4 xl:max-h-[calc(100dvb-8rem)] xl:min-h-0 xl:overflow-auto";

  if (loading) {
    return (
      <Card className={shell}>
        <CardHeader>
          <CardTitle>{t("eventDetail")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TableRowSkeleton rows={4} />
        </CardContent>
      </Card>
    );
  }

  if (selected) {
    return (
      <Card className={shell}>
        <CardHeader>
          <CardTitle>{t("eventDetail")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SiemEventDetail
            event={selected}
            t={t}
            canCreate={canCreate}
            caseTitle={caseTitle}
            onCaseTitleChange={onCaseTitleChange}
            createPending={createPending}
            onCreateCase={onCreateCase}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={shell} data-testid="siem-event-detail-empty">
      <CardHeader>
        <CardTitle>{t("eventDetail")}</CardTitle>
        <CardDescription>{t("emptyInspectorHint")}</CardDescription>
      </CardHeader>
    </Card>
  );
}
