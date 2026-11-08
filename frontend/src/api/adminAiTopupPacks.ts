import api from "./scans";

/**
 * One row of the AI top-up pack catalog. `code` is a stable identifier: orders
 * snapshot it, so a pack may be deactivated but is never hard-deleted.
 */
export interface AdminTopupPack {
  id: string;
  code: string;
  label: string;
  amount_idr: number;
  bonus_idr: number;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AdminTopupPackList {
  items: AdminTopupPack[];
  total: number;
  page?: number;
  limit?: number;
}

export interface AdminTopupPackFilters {
  /** Only sellable packs. The admin page leaves this off to show the whole catalog. */
  active_only?: boolean;
}

export interface CreateAdminTopupPackInput {
  code: string;
  label: string;
  amount_idr: number;
  bonus_idr?: number;
  active?: boolean;
  sort_order?: number;
}

export type UpdateAdminTopupPackInput = Partial<CreateAdminTopupPackInput>;

export async function listAdminTopupPacks(
  params: AdminTopupPackFilters = {},
): Promise<AdminTopupPackList> {
  const { data } = await api.get<AdminTopupPackList>(
    "/api/admin/ai/topup/packs",
    { params },
  );
  return data;
}

export async function createAdminTopupPack(
  body: CreateAdminTopupPackInput,
): Promise<AdminTopupPack> {
  const { data } = await api.post<AdminTopupPack>(
    "/api/admin/ai/topup/packs",
    body,
  );
  return data;
}

export async function updateAdminTopupPack(
  id: string,
  body: UpdateAdminTopupPackInput,
): Promise<AdminTopupPack> {
  const { data } = await api.patch<AdminTopupPack>(
    `/api/admin/ai/topup/packs/${id}`,
    body,
  );
  return data;
}
