import { History, MoreHorizontal, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { PromoCode } from "@/api/admin";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function PromoRowActions({
  item,
  onEdit,
  onToggle,
  onRedemptions,
  onHistory,
  onDelete,
}: {
  item: PromoCode;
  onEdit: (item: PromoCode) => void;
  onToggle: (item: PromoCode) => void;
  onRedemptions: (item: PromoCode) => void;
  onHistory: (item: PromoCode) => void;
  onDelete: (item: PromoCode) => void;
}) {
  const { t } = useTranslation("admin");
  const isUsed = item.redemption_count > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-11 w-11 min-h-11 min-w-11 p-0 md:h-9 md:w-9 md:min-h-9 md:min-w-9" data-testid={`promo-actions-${item.id}`} aria-label={t("actionsMenu")}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem data-testid={`promo-edit-${item.id}`} onSelect={() => onEdit(item)}>
          {t("promoEdit")}
        </DropdownMenuItem>
        <DropdownMenuItem data-testid={`promo-toggle-${item.id}`} onSelect={() => onToggle(item)}>
          {item.active ? t("promoDeactivate") : t("promoReactivate")}
        </DropdownMenuItem>
        <DropdownMenuItem data-testid={`promo-redemptions-${item.id}`} onSelect={() => onRedemptions(item)}>
          <Users className="mr-2 h-4 w-4" />
          {t("promoRedemptions")}
        </DropdownMenuItem>
        <DropdownMenuItem data-testid={`promo-history-${item.id}`} onSelect={() => onHistory(item)}>
          <History className="mr-2 h-4 w-4" />
          {t("promoHistory")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isUsed}
          title={isUsed ? t("promoDeleteBlocked") : undefined}
          data-testid={`promo-delete-${item.id}`}
          onSelect={() => {
            if (!isUsed) onDelete(item);
          }}
        >
          {t("promoDelete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
