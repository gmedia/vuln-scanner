import { Fragment, useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ListFilter, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ScanFinding } from "@/api/scans";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/Input";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { cn } from "@/lib/utils";
import FindingDetail from "@/components/results/FindingDetail";

interface FindingsTableProps {
  findings: ScanFinding[] | undefined;
  isLoading: boolean;
}

type SortKey = "severity" | "title" | "category" | "cvss_score";
type SortDir = "asc" | "desc";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const SEVERITY_FILTERS = ["critical", "high", "medium", "low", "info"] as const;

function FindingsTable({ findings, isLoading }: FindingsTableProps) {
  const { t } = useTranslation("scan");
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    if (!findings) return [];
    const q = search.trim().toLowerCase();
    return findings.filter((f) => {
      if (severityFilter.size > 0 && !severityFilter.has(f.severity)) {
        return false;
      }
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        (f.cve_id && f.cve_id.toLowerCase().includes(q)) ||
        (f.category && f.category.toLowerCase().includes(q)) ||
        f.severity.toLowerCase().includes(q)
      );
    });
  }, [findings, search, severityFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;

      switch (sortKey) {
        case "severity":
          va = SEVERITY_ORDER[a.severity] ?? 99;
          vb = SEVERITY_ORDER[b.severity] ?? 99;
          break;
        case "title":
          va = a.title.toLowerCase();
          vb = b.title.toLowerCase();
          break;
        case "category":
          va = (a.category || "").toLowerCase();
          vb = (b.category || "").toLowerCase();
          break;
        case "cvss_score":
          va = a.cvss_score ?? 0;
          vb = b.cvss_score ?? 0;
          break;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const cvssColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 9) return "text-red-400";
    if (score >= 7) return "text-orange-400";
    if (score >= 4) return "text-yellow-400";
    return "text-blue-400";
  };

  const cvssBarColor = (score: number | null) => {
    if (score === null) return "bg-muted-foreground";
    if (score >= 9) return "bg-red-400";
    if (score >= 7) return "bg-orange-400";
    if (score >= 4) return "bg-yellow-400";
    return "bg-blue-400";
  };

  if (isLoading) {
    return <TableRowSkeleton rows={6} />;
  }

  if (!findings || findings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-3 rounded-full bg-muted p-3">
          <Search className="h-6 w-6 text-foreground/50" />
        </div>
        <p className="mb-1 text-sm text-foreground">{t("noFindings")}</p>
        <p className="text-xs text-muted-foreground">{t("cleanResult")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t("filterFindings")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={t("filterSeverity")}
            >
              <ListFilter className="h-4 w-4" />
              {t("severity")}
              {severityFilter.size > 0 ? ` (${severityFilter.size})` : ""}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("severity")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SEVERITY_FILTERS.map((sev) => (
              <DropdownMenuCheckboxItem
                key={sev}
                checked={severityFilter.has(sev)}
                onCheckedChange={(checked) => {
                  setSeverityFilter((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(sev);
                    else next.delete(sev);
                    return next;
                  });
                }}
                className="capitalize"
              >
                {sev}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-2 md:hidden">
        {sorted.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {t("noMatchingFindings")}
          </p>
        ) : (
          sorted.map((finding) => {
            const isExpanded = expandedId === finding.id;
            return (
              <div
                key={finding.id}
                className="rounded-lg border border-border bg-card p-3"
              >
                <button
                  type="button"
                  className="flex w-full min-h-11 items-start gap-2 text-left"
                  onClick={() =>
                    setExpandedId((prev) =>
                      prev === finding.id ? null : finding.id,
                    )
                  }
                >
                  <Badge
                    variant={
                      finding.severity as
                        | "critical"
                        | "high"
                        | "medium"
                        | "low"
                        | "info"
                    }
                    className="mt-0.5 shrink-0 text-[10px] capitalize"
                  >
                    {finding.severity}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-foreground">
                      {finding.title}
                    </span>
                    <span className="mt-0.5 block break-all text-[11px] text-muted-foreground">
                      {finding.category || "-"}
                    </span>
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
                {isExpanded ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <FindingDetail finding={finding} />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <div className="hidden rounded-lg border border-border md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <Th
                label={t("severity")}
                sortKey="severity"
                active={sortKey}
                dir={sortDir}
                onClick={() => toggleSort("severity")}
              />
              <Th
                label={t("colTitle")}
                sortKey="title"
                active={sortKey}
                dir={sortDir}
                onClick={() => toggleSort("title")}
              />
              <Th
                label={t("colCategory")}
                sortKey="category"
                active={sortKey}
                dir={sortDir}
                onClick={() => toggleSort("category")}
              />
              <TableHead className="px-3 py-2.5 text-[10px] uppercase tracking-wider">
                {t("colCve")}
              </TableHead>
              <Th
                label={t("colCvss")}
                sortKey="cvss_score"
                active={sortKey}
                dir={sortDir}
                onClick={() => toggleSort("cvss_score")}
              />
              <TableHead className="px-3 py-2.5 text-[10px] uppercase tracking-wider">
                {t("colRemediation")}
              </TableHead>
              <TableHead className="w-8 px-3 py-2.5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={7}
                  className="p-8 text-center text-sm text-muted-foreground"
                >
                  {t("noMatchingFindings")}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((finding) => {
                const isExpanded = expandedId === finding.id;
                return (
                  <Fragment key={finding.id}>
                    <TableRow
                      onClick={() =>
                        setExpandedId((prev) =>
                          prev === finding.id ? null : finding.id,
                        )
                      }
                      aria-expanded={isExpanded}
                      className={cn(
                        "group cursor-pointer hover:bg-muted/30",
                        isExpanded && "bg-muted/20",
                      )}
                    >
                      <TableCell className="px-3 py-2.5">
                        <Badge
                          variant={
                            finding.severity as
                              | "critical"
                              | "high"
                              | "medium"
                              | "low"
                              | "info"
                          }
                          className="text-[10px] capitalize"
                        >
                          {finding.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate px-3 py-2.5 text-xs text-foreground">
                        {finding.title}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
                        {finding.category || "-"}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        {finding.cve_id ? (
                          <a
                            href={`https://nvd.nist.gov/vuln/detail/${finding.cve_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary hover:underline"
                          >
                            {finding.cve_id}
                          </a>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                cvssBarColor(finding.cvss_score),
                              )}
                              style={{
                                width: `${((finding.cvss_score ?? 0) / 10) * 100}%`,
                              }}
                            />
                          </div>
                          <span
                            className={cn(
                              "font-mono text-xs font-medium tabular-nums",
                              cvssColor(finding.cvss_score),
                            )}
                          >
                            {finding.cvss_score?.toFixed(1) ?? "-"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-xs">
                        {finding.remediation ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            {t("hasRemediation")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-center">
                        {isExpanded ? (
                          <ChevronUp className="ml-auto h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        ) : (
                          <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground transition-colors" />
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow
                        className="bg-card/30 hover:bg-card/30"
                        data-testid={`finding-detail-row-${finding.id}`}
                      >
                        <TableCell colSpan={7} className="p-3">
                          <FindingDetail finding={finding} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Th({
  label,
  sortKey,
  active,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <TableHead
      onClick={onClick}
      className="cursor-pointer select-none px-3 py-2.5 text-[10px] uppercase tracking-wider transition-colors hover:text-foreground"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active === sortKey && (
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              dir === "desc" && "rotate-180",
            )}
          />
        )}
      </span>
    </TableHead>
  );
}

export default FindingsTable;
