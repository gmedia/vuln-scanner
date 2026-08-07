import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  updateSchedule,
  type ScanSchedule,
} from "@/api/schedules";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function Schedules() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [scanType, setScanType] = useState<"domain" | "ip">("domain");
  const [target, setTarget] = useState("");
  const [cadence, setCadence] = useState<"weekly" | "monthly">("weekly");
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["schedules"],
    queryFn: listSchedules,
  });

  const createMut = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["schedules"] });
      setName("");
      setTarget("");
      setFormError(null);
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "response" in err
          ? String(
              (err as { response?: { data?: { detail?: string } } }).response
                ?.data?.detail ?? "Failed to create schedule",
            )
          : "Failed to create schedule";
      setFormError(msg);
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateSchedule(id, { enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["schedules"] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["schedules"] }),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!target.trim()) {
      setFormError("Target is required");
      return;
    }
    createMut.mutate({
      name: name.trim() || undefined,
      scan_type: scanType,
      target: target.trim(),
      cadence,
      timezone: "Asia/Jakarta",
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <CalendarClock className="h-6 w-6 text-primary" />
        <h2 className="text-lg font-bold tracking-wide text-foreground">
          Scan schedules
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">New schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sched-name">Label (optional)</Label>
                <Input
                  id="sched-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Weekly external"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={scanType}
                  onValueChange={(v) => setScanType(v as "domain" | "ip")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="domain">Domain</SelectItem>
                    <SelectItem value="ip">IP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sched-target">Target</Label>
                <Input
                  id="sched-target"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={
                    scanType === "ip" ? "203.0.113.10" : "example.com"
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Cadence</Label>
                <Select
                  value={cadence}
                  onValueChange={(v) => setCadence(v as "weekly" | "monthly")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={createMut.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {createMut.isPending ? "Creating…" : "Create schedule"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            Your schedules
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive">Failed to load schedules</p>
          )}
          {!isLoading && data && data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No schedules yet. Create a weekly or monthly domain/IP scan above.
            </p>
          )}
          {!isLoading && data && data.length > 0 && (
            <ul className="divide-y divide-border">
              {data.map((s: ScanSchedule) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium text-foreground">
                      {s.name || s.target}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {s.scan_type} · {s.cadence}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Next: {formatWhen(s.next_run_at)}
                      {s.last_job_id && (
                        <>
                          {" · "}
                          <Link
                            to={`/scan/${s.last_job_id}`}
                            className="text-primary hover:underline"
                          >
                            last job
                          </Link>
                        </>
                      )}
                    </p>
                    {s.last_error && (
                      <p className="text-xs text-destructive">{s.last_error}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={toggleMut.isPending}
                      onClick={() =>
                        toggleMut.mutate({ id: s.id, enabled: !s.enabled })
                      }
                    >
                      {s.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        if (
                          window.confirm(`Delete schedule for ${s.target}?`)
                        ) {
                          deleteMut.mutate(s.id);
                        }
                      }}
                      aria-label="Delete schedule"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Schedules;
