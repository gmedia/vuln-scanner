import api from "./scans";

export interface InboxItem {
  id: string;
  kind: string;
  status: string;
  recipient_masked: string;
  attempts: number;
  created_at: string;
  job_id?: string | null;
}

export interface InboxListResponse {
  items: InboxItem[];
  total: number;
}

export async function getInbox(params: {
  page?: number;
  page_size?: number;
  kind?: string;
  status?: string;
}): Promise<InboxListResponse> {
  const { data } = await api.get<InboxListResponse>("/api/inbox", { params });
  return data;
}

export const inboxApi = {
  list: getInbox,
};
