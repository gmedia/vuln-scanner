import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import type { ScanFinding } from "@/api/scans";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
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
        <p className="mb-1 font-mono text-sm text-foreground">No findings detected</p>
        <p className="font-mono text-xs text-muted-foreground">
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
          className="pl-9 font-mono"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
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
              <Th
                label="CVE"
                sortKey="cvss_score"
                active={sortKey}
                dir={sortDir}
                onClick={() => toggleSort("cvss_score")}
              />
              <th className="px-3 py-2.5 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                CVSS
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center font-mono text-sm text-muted-foreground">
                  No matching findings
                </td>
              </tr>
            ) : (
              sorted.map((finding) => (
                <tr
                  key={finding.id}
                  onClick={() =>
                    setExpandedId((prev) =>
                      prev === finding.id ? null : finding.id,
                    )
                  }
                  className="group cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/30"
                >
                  <td className="px-3 py-2.5">
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
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-foreground max-w-[200px] truncate">
                    {finding.title}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {finding.category || "-"}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
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
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs font-medium text-right">
                    <span className={cvssColor(finding.cvss_score)}>
                      {finding.cvss_score?.toFixed(1) ?? "-"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {expandedId === finding.id ? (
                      <ChevronUp className="ml-auto h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    ) : (
                      <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground transition-colors" />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sorted.map(
        (finding) =>
          expandedId === finding.id && (
            <FindingDetail key={`detail-${finding.id}`} finding={finding} />
          ),
      )}
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
    <th
      onClick={onClick}
      className="cursor-pointer px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground select-none"
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
    </th>
  );
}

export default FindingsTable;
