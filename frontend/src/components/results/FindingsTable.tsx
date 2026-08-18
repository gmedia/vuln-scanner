import { Fragment, useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import type { ScanFinding } from "@/api/scans";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
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

function FindingsTable({ findings, isLoading }: FindingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
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
    if (!search.trim()) return findings;
    const q = search.toLowerCase();
    return findings.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        (f.cve_id && f.cve_id.toLowerCase().includes(q)) ||
        (f.category && f.category.toLowerCase().includes(q)) ||
        f.severity.toLowerCase().includes(q),
    );
  }, [findings, search]);

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
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!findings || findings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-3 rounded-full bg-muted p-3">
          <Search className="h-6 w-6 text-muted-foreground opacity-40" />
        </div>
        <p className="mb-1 text-sm text-foreground">No findings detected</p>
        <p className="text-xs text-muted-foreground">
          This scan returned a clean result.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Filter findings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <Th
                label="Severity"
                sortKey="severity"
                active={sortKey}
                dir={sortDir}
                onClick={() => toggleSort("severity")}
              />
              <Th
                label="Title"
                sortKey="title"
                active={sortKey}
                dir={sortDir}
                onClick={() => toggleSort("title")}
              />
              <Th
                label="Category"
                sortKey="category"
                active={sortKey}
                dir={sortDir}
                onClick={() => toggleSort("category")}
              />
              <TableHead className="px-3 py-2.5 text-[10px] uppercase tracking-wider">
                CVE
              </TableHead>
              <Th
                label="CVSS"
                sortKey="cvss_score"
                active={sortKey}
                dir={sortDir}
                onClick={() => toggleSort("cvss_score")}
              />
              <TableHead className="px-3 py-2.5 text-[10px] uppercase tracking-wider">
                Saran aksi
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
                  No matching findings
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
                            Ada saran
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
