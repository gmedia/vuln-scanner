import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Palette, Search, X } from "lucide-react";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  TAG_COLOR_DOT,
  isNamedTagColor,
  tagColorClass,
  tagColorHex,
  tagColorStyle,
} from "@/lib/tagColors";
import { cn } from "@/lib/utils";

export type AssetTypeFilter = "all" | "ip" | "domain";

const TYPE_OPTIONS: readonly {
  value: AssetTypeFilter;
  labelKey: "typeDomain" | "typeIp" | "typeAllShort";
}[] = [
  { value: "domain", labelKey: "typeDomain" },
  { value: "ip", labelKey: "typeIp" },
  { value: "all", labelKey: "typeAllShort" },
];

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
  onClearAll,
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
  readonly onClearAll: () => void;
  readonly counts: { readonly shown: number; readonly total: number };
}) {
  const { t } = useTranslation("assets");
  const hasTags = allTags.length > 0;
  const filtersActive =
    search.trim() !== "" || typeFilter !== "all" || tagFilters.length > 0;
  const [tagOpen, setTagOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);

  return (
    <div data-testid="assets-filters" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Label htmlFor="asset-search" className="sr-only">
            {t("search")}
          </Label>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="asset-search"
            data-testid="asset-search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 min-h-10 pl-9"
          />
        </div>

        <div
          id="asset-type-filter"
          data-testid="asset-type-filter"
          role="group"
          aria-label={t("type")}
          className="inline-flex h-10 min-h-10 overflow-hidden rounded-md border border-border"
        >
          {TYPE_OPTIONS.map((opt) => {
            const active = typeFilter === opt.value;
            return (
              <Button
                key={opt.value}
                type="button"
                variant="ghost"
                aria-pressed={active}
                className={cn(
                  "h-10 min-h-10 rounded-none px-3 text-xs shadow-none",
                  "border-0 border-r border-border last:border-r-0",
                  active
                    ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onTypeFilter(opt.value)}
              >
                {t(opt.labelKey)}
              </Button>
            );
          })}
        </div>

        {hasTags ? (
          <Popover open={tagOpen} onOpenChange={setTagOpen}>
            <PopoverTrigger asChild>
              <Button
                id="asset-tag-filter"
                type="button"
                variant="outline"
                data-testid="asset-tag-filter"
                className={cn(
                  "h-10 min-h-10 shrink-0 gap-2 font-normal",
                  tagFilters.length > 0 &&
                    "border-primary/40 bg-primary/10 text-primary",
                )}
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
              <div className="mt-2 flex items-center justify-between gap-2">
                {tagFilters.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 min-h-8"
                    data-testid="asset-tag-filter-clear"
                    onClick={onClearTags}
                  >
                    {t("clearTagFilter")}
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 min-h-8"
                  onClick={() => {
                    setTagOpen(false);
                    setColorsOpen(true);
                  }}
                >
                  {t("manageColors")}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}

        {hasTags ? (
          <Sheet open={colorsOpen} onOpenChange={setColorsOpen}>
            <Button
              type="button"
              variant="ghost"
              data-testid="asset-tag-colors-toggle"
              className="ml-auto h-10 w-10 min-h-10 min-w-10 shrink-0 p-0"
              aria-label={t("manageColors")}
              onClick={() => setColorsOpen(true)}
            >
              <Palette className="h-4 w-4" />
            </Button>
            <SheetContent className="flex flex-col">
              <SheetHeader>
                <SheetTitle>{t("tagColors")}</SheetTitle>
                <SheetDescription>{t("tagColorsHint")}</SheetDescription>
              </SheetHeader>
              <ul
                className="flex flex-col gap-2 overflow-y-auto px-4 pb-4"
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
            </SheetContent>
          </Sheet>
        ) : null}
      </div>

      {filtersActive ? (
        <div className="flex flex-wrap items-center gap-2">
          {tagFilters.map((tag) => {
            const dot = tagDotProps(tag, colorMap);
            return (
              <span
                key={tag}
                className="inline-flex max-w-full items-center gap-0.5"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-0 p-0"
                  onClick={() => setTagOpen(true)}
                >
                  <Badge
                    variant="default"
                    className={cn("gap-1.5", tagColorClass(tag, colorMap))}
                    style={tagColorStyle(tag, colorMap)}
                    data-testid={`asset-tag-chip-${tag}`}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        dot.className,
                      )}
                      style={dot.style}
                    />
                    {tag}
                  </Badge>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 min-h-6 p-0 text-muted-foreground"
                  aria-label={t("removeTag", { tag })}
                  onClick={() => onToggleTag(tag)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </span>
            );
          })}
          <p
            className="ml-auto text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {t("filterShowing", {
              shown: counts.shown,
              total: counts.total,
            })}
            {" · "}
            <Button
              type="button"
              variant="link"
              className="h-auto min-h-0 px-0 text-xs"
              onClick={onClearAll}
            >
              {t("clearFilters")}
            </Button>
          </p>
        </div>
      ) : null}
    </div>
  );
}
