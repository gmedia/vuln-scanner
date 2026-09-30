import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listGuardAgents } from "@/api/guard";
import {
  addSiemCaseNote,
  canCreateSiemCase,
  canManageSiemCase,
  createSiemCase,
  getSiemStatus,
  isSiemDisabledError,
  listSiemCases,
  listSiemEvents,
  patchSiemCase,
} from "@/api/siem";
import { apiDetail } from "@/components/siem/siemErrors";
import type { SiemFilterDraft } from "@/components/siem/SiemSearchFilters";
import { useIsMobile, useIsXl } from "@/hooks/use-mobile";
import { useAuthStore } from "@/store/authStore";

const EMPTY_DRAFT: SiemFilterDraft = {
  since: "",
  until: "",
  minLevel: "7",
  agentId: "",
  q: "",
};

export function useSiemConsole(t: (key: string) => string) {
  const queryClient = useQueryClient();
  const activeRole = useAuthStore((s) => s.activeRole);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const role = activeRole();
  const canCreate = canCreateSiemCase(role);
  const canManage = canManageSiemCase(role);

  const [draft, setDraft] = useState<SiemFilterDraft>(EMPTY_DRAFT);
  const [eventPage, setEventPage] = useState(0);
  const [applied, setApplied] = useState({
    since: "",
    until: "",
    min_level: "",
    agent_id: "",
    q: "",
  });
  const isMobile = useIsMobile();
  const isXl = useIsXl();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [caseTitle, setCaseTitle] = useState("");
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const statusQ = useQuery({
    queryKey: ["siem", activeOrgId, "status"],
    queryFn: getSiemStatus,
    enabled: !!activeOrgId,
    retry: false,
  });

  const featureOff = statusQ.isError && isSiemDisabledError(statusQ.error);
  const featureOn = !!statusQ.data?.enabled && !featureOff;

  const agentsQ = useQuery({
    queryKey: ["guard", activeOrgId, "agents"],
    queryFn: listGuardAgents,
    enabled: !!activeOrgId && featureOn,
  });

  const eventFilters = useMemo(() => {
    const filters: {
      since?: string;
      until?: string;
      min_level?: number;
      agent_id?: string;
      q?: string;
      limit: number;
    } = { limit: 50 };
    if (applied.since) filters.since = new Date(applied.since).toISOString();
    if (applied.until) filters.until = new Date(applied.until).toISOString();
    if (applied.min_level) filters.min_level = Number(applied.min_level);
    if (applied.agent_id) filters.agent_id = applied.agent_id;
    if (applied.q) filters.q = applied.q;
    return filters;
  }, [applied]);

  const eventsQ = useQuery({
    queryKey: ["siem", activeOrgId, "events", eventFilters],
    queryFn: () => listSiemEvents(eventFilters),
    enabled: !!activeOrgId && featureOn,
  });

  const casesQ = useQuery({
    queryKey: ["siem", activeOrgId, "cases"],
    queryFn: listSiemCases,
    enabled: !!activeOrgId && featureOn,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["siem"] });
  };

  const createMut = useMutation({
    mutationFn: createSiemCase,
    onSuccess: (c) => {
      setActionError(null);
      setCaseTitle("");
      setActiveCaseId(c.id);
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("createCaseFail"))),
  });

  const patchMut = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "open" | "ack" | "closed";
    }) => patchSiemCase(id, { status }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("patchCaseFail"))),
  });

  const noteMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      addSiemCaseNote(id, body),
    onSuccess: () => {
      setNoteBody("");
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("addNoteFail"))),
  });

  const agents = agentsQ.data ?? [];
  const allEvents = eventsQ.data?.items ?? [];
  const pageSize = isMobile ? 10 : 25;
  const eventPageCount = Math.max(1, Math.ceil(allEvents.length / pageSize));
  const safeEventPage = Math.min(eventPage, eventPageCount - 1);
  const events = allEvents.slice(
    safeEventPage * pageSize,
    safeEventPage * pageSize + pageSize,
  );

  const selectedMatch =
    events.find((e) => e.external_id === selectedId) ?? null;
  const selected = isXl ? (selectedMatch ?? events[0] ?? null) : selectedMatch;
  const selectedKey = selected?.external_id ?? null;

  const cases = casesQ.data?.items ?? [];
  const activeCase = cases.find((c) => c.id === activeCaseId);

  return {
    activeOrgId,
    canCreate,
    canManage,
    draft,
    setDraft,
    isXl,
    caseTitle,
    setCaseTitle,
    noteBody,
    setNoteBody,
    actionError,
    statusQ,
    featureOff,
    featureOn,
    agentsQ,
    eventsQ,
    casesQ,
    agents,
    allEvents,
    pageSize,
    eventPageCount,
    safeEventPage,
    events,
    selected,
    selectedKey,
    setSelectedId,
    cases,
    activeCase,
    createMut,
    patchMut,
    noteMut,
    applyFilters: () => {
      setEventPage(0);
      setApplied({
        since: draft.since,
        until: draft.until,
        min_level: draft.minLevel,
        agent_id: draft.agentId,
        q: draft.q,
      });
    },
    setEventPage,
    createCaseFrom: (externalId: string) => {
      createMut.mutate({
        title: caseTitle.trim(),
        external_id: externalId,
      });
    },
    setActiveCaseId,
  };
}
