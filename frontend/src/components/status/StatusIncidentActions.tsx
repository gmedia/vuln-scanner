import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { deleteIncident, type StatusIncident } from "@/api/statusPage";
import { Button } from "@/components/ui/Button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiErrorMessage } from "@/api/apiErrors";


export function StatusIncidentActions({
  incident,
  canDelete,
  testIdPrefix,
  onEdit,
  onPostUpdate,
  onDone,
}: {
  readonly incident: StatusIncident;
  readonly canDelete: boolean;
  readonly testIdPrefix: string;
  readonly onEdit: () => void;
  readonly onPostUpdate: () => void;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation("statusPage");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const id = incident.id;
  const delMut = useMutation({
    mutationFn: () => deleteIncident(id),
    onSuccess: () => {
      toast.success(t("incidentDeletedToast"));
      onDone();
    },
    onError: (err) => toast.error(apiErrorMessage(err, t("deleteIncident"))),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 w-11 min-h-11 min-w-11 shrink-0 p-0 md:h-9 md:w-9 md:min-h-9 md:min-w-9"
            data-testid={`${testIdPrefix}-menu-${id}`}
            aria-label={t("actionsMenu")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            data-testid={`${testIdPrefix}-edit-${id}`}
            onSelect={onEdit}
          >
            {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid={`${testIdPrefix}-update-${id}`}
            onSelect={onPostUpdate}
          >
            {t("postUpdate")}
          </DropdownMenuItem>
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                data-testid={`${testIdPrefix}-delete-${id}`}
                onSelect={() => setDeleteOpen(true)}
              >
                {t("deleteIncident")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteIncident")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteIncidentConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid={`${testIdPrefix}-delete-confirm-${id}`}
              onClick={() => delMut.mutate()}
            >
              {t("deleteIncident")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
