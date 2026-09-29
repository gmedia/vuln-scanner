import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { TAG_COLOR_KEYS, type TagColorValue } from "@/api/assets";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  TAG_COLOR_DOT,
  isNamedTagColor,
  tagColorClass,
  tagColorHex,
  tagColorStyle,
} from "@/lib/tagColors";
import { cn } from "@/lib/utils";

export type AssetTypeFilter = "all" | "ip" | "domain";

function tagDotProps(
  tag: string,
  colorMap: Record<string, TagColorValue>,
): { className: string; style?: { backgroundColor: string } } {
  const key = colorMap[tag] ?? "gray";
  if (isNamedTagColor(key)) {
    return { className: TAG_COLOR_DOT[key] };
  }
  return { className: "", style: { backgroundColor: key } };
}

export function AssetFilters({
  search,
  typeFilter,
  allTags,
  tagOptions,
  tagFilters,
  tagQuery,
  colorMap,
  onSearch,
  onTypeFilter,
  onToggleTag,
  onClearTags,
  onTagQuery,
  onPickColor,
  counts,
}: {
  readonly search: string;
  readonly typeFilter: AssetTypeFilter;
  readonly allTags: readonly string[];
  readonly tagOptions: readonly string[];
  readonly tagFilters: readonly string[];
  readonly tagQuery: string;
  readonly colorMap: Record<string, TagColorValue>;
  readonly onSearch: (value: string) => void;
  readonly onTypeFilter: (value: AssetTypeFilter) => void;
  readonly onToggleTag: (tag: string) => void;
  readonly onClearTags: () => void;
  readonly onTagQuery: (value: string) => void;
  readonly onPickColor: (tag: string, color: TagColorValue) => void;
  readonly counts: { readonly shown: number; readonly total: number };
}) {
  const { t } = useTranslation("assets");
  const hasTags = allTags.length > 0;
  const filtersActive =
    search.trim() !== "" || typeFilter !== "all" || tagFilters.length > 0;

  return (
    <div className="space-y-3">
      <div
        data-testid="assets-filters"
        className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="asset-search">{t("search")}</Label>
          <Input
            id="asset-search"
            data-testid="asset-search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 min-h-10"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="asset-type-filter">{t("type")}</Label>
          <Select
            value={typeFilter}
            onValueChange={(value) => onTypeFilter(value as AssetTypeFilter)}
          >
            <SelectTrigger
              id="asset-type-filter"
              data-testid="asset-type-filter"
              aria-label={t("type")}
              className="h-10 min-h-10"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("typeAll")}</SelectItem>
              <SelectItem value="domain">{t("typeDomain")}</SelectItem>
              <SelectItem value="ip">{t("typeIp")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasTags ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="asset-tag-filter">{t("filterTag")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="asset-tag-filter"
                  type="button"
                  variant="outline"
                  data-testid="asset-tag-filter"
                  className="h-10 min-h-10 w-full justify-start font-normal"
                  aria-label={t("filterTag")}
                >
                  {tagFilters.length === 0
                    ? t("allTags")
                    : t("filterTagCount", { count: tagFilters.length })}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[min(24rem,calc(100vw-2rem))] p-3"
              >
                <Input
                  data-testid="asset-tag-filter-search"
                  value={tagQuery}
                  onChange={(e) => onTagQuery(e.target.value)}
                  placeholder={t("filterTagSearch")}
                  aria-label={t("filterTagSearch")}
                  className="h-10 min-h-10"
                />
                <ul
                  className="mt-2 max-h-56 overflow-y-auto"
                  data-testid="asset-tag-filter-list"
                >
                  {tagOptions.length === 0 ? (
                    <li className="px-1 py-2 text-sm text-muted-foreground">
                      {t("filterTagNone")}
                    </li>
                  ) : (
                    tagOptions.map((tag) => {
                      const on = tagFilters.includes(tag);
                      const dot = tagDotProps(tag, colorMap);
                      return (
                        <li key={tag}>
                          <Button
                            type="button"
                            variant={on ? "outline" : "ghost"}
                            className="h-9 w-full justify-start gap-2 font-normal"
                            data-testid={`asset-tag-filter-opt-${tag}`}
                            aria-pressed={on}
                            onClick={() => onToggleTag(tag)}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "h-2.5 w-2.5 shrink-0 rounded-full",
                                dot.className,
                              )}
                              style={dot.style}
                            />
                            <span className="min-w-0 truncate">{tag}</span>
                            {on ? (
                              <Check
                                aria-hidden
                                className="ml-auto h-4 w-4 shrink-0"
                              />
                            ) : null}
                          </Button>
                        </li>
                      );
                    })
                  )}
                </ul>
                {tagFilters.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    data-testid="asset-tag-filter-clear"
                    onClick={onClearTags}
                  >
                    {t("clearTagFilter")}
                  </Button>
                ) : null}
              </PopoverContent>
            </Popover>
          </div>
        ) : null}
        {hasTags ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="asset-tag-colors-toggle">{t("manageColors")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="asset-tag-colors-toggle"
                  type="button"
                  variant="outline"
                  data-testid="asset-tag-colors-toggle"
                  className="h-10 min-h-10 w-full justify-start font-normal"
                  aria-label={t("manageColors")}
                >
                  {t("manageColors")}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[min(24rem,calc(100vw-2rem))] p-3"
              >
                <ul
                  className="flex flex-col gap-2"
                  data-testid="asset-tag-colors"
                >
                  {allTags.map((tag) => (
                    <li
                      key={tag}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1.5"
                    >
                      <Badge
                        variant="default"
                        className={tagColorClass(tag, colorMap)}
                        style={tagColorStyle(tag, colorMap)}
                      >
                        {tag}
                      </Badge>
                      <div
                        className="flex items-center gap-1"
                        role="group"
                        aria-label={t("tagColorFor", { tag })}
                      >
                        {TAG_COLOR_KEYS.map((key) => {
                          const active = (colorMap[tag] ?? "gray") === key;
                          return (
                            <Button
                              key={key}
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "h-6 w-6 min-h-6 p-0",
                                active && "ring-2 ring-ring ring-offset-1",
                              )}
                              data-testid={`asset-tag-color-${tag}-${key}`}
                              aria-label={t("tagColorPick", {
                                tag,
                                color: key,
                              })}
                              aria-pressed={active}
                              onClick={() => onPickColor(tag, key)}
                            >
                              <span
                                className={cn(
                                  "block h-3.5 w-3.5 rounded-full",
                                  TAG_COLOR_DOT[key],
                                )}
                              />
                            </Button>
                          );
                        })}
                        <Label
                          htmlFor={`asset-tag-picker-${tag}`}
                          className="sr-only"
                        >
                          {t("tagColorPicker", { tag })}
                        </Label>
                        <input
                          id={`asset-tag-picker-${tag}`}
                          type="color"
                          className="h-6 w-6 cursor-pointer rounded-md border border-border bg-transparent p-0"
                          data-testid={`asset-tag-color-picker-${tag}`}
                          aria-label={t("tagColorPicker", { tag })}
                          value={tagColorHex(tag, colorMap)}
                          onChange={(e) =>
                            onPickColor(
                              tag,
                              e.target.value.toLowerCase() as TagColorValue,
                            )
                          }
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
          {filtersActive
            ? t("filterShowing", {
                shown: counts.shown,
                total: counts.total,
              })
            : t("filterHint")}
        </p>
      </div>
      {tagFilters.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tagFilters.map((tag) => (
            <Button
              key={tag}
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto p-0"
              onClick={() => onToggleTag(tag)}
            >
              <Badge
                variant="default"
                className={tagColorClass(tag, colorMap)}
                style={tagColorStyle(tag, colorMap)}
                data-testid={`asset-tag-chip-${tag}`}
              >
                {tag} ×
              </Badge>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
