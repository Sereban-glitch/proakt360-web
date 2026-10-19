// Типизированный клиент API «ПрорАКТ 360» (demo-backend на Prisma+SQLite).
// Все запросы — относительные пути. Формы ответов соответствуют src/db/queries.ts.

export type ActStatus = "paid" | "partial" | "unpaid" | "zero";

export type PhotoBrief = {
  id: number;
  objectId: number;
  actId: number | null;
  actNo: number;
  stageId: number | null;
  estimateLineId: number | null;
  kind: string;
  storage: string;
  caption: string;
  visible: boolean;
  takenAt: string | null;
  createdAt: string;
  thumbUrl: string;
  fileUrl: string;
};

export type ActBrief = {
  id: number;
  actNo: number;
  objectId: number;
  objectName: string;
  customer: string;
  date: string;
  periodFrom: string | null;
  periodTo: string | null;
  token: string;
  total: number;
  paid: number;
  photos: number;
  status: ActStatus;
};

export type EstimateBrief = {
  id: number;
  objectId: number;
  objectName: string;
  title: string;
  status: string;
  coeff: number;
  note: string;
  shareToken: string | null;
  sentAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  lines: number;
  total: number;
  visible: number;
  hidden: number;
  doneSum: number;
  actedSum: number;
  remainingSum: number;
  hiddenShare: number;
  progress: number;
};

export type ObjectBrief = {
  id: number;
  name: string;
  customer: string;
  address: string;
  status: string;
  deadline: string | null;
  clientToken: string;
  locale: string;
  createdAt: string;
  acts: number;
  total: number;
  paid: number;
  photos: number;
  debt: number;
  progress: number;
};

export type StageBrief = {
  id: number;
  objectId: number;
  order: number;
  title: string;
  status: string;
  note: string;
  doneAt: string | null;
  photos: PhotoBrief[];
};

export type EstimateLineDTO = {
  id: number;
  estimateId: number;
  pos: number;
  name: string;
  qty: number;
  unit: string;
  price: number;
  hidden: boolean;
  done: boolean;
  doneQty: number;
  section: string;
  note: string;
  sum: number;
  remainingQty: number;
  actedSum: number;
};

export type CommentDTO = {
  id: number;
  estimateId: number;
  author: string;
  text: string;
  createdAt: string;
};

export type PaymentDTO = {
  id: number;
  actId: number;
  amount: number;
  note: string;
  at: string;
};

export type ActLineDTO = {
  id: number;
  actId: number;
  estimateLineId: number | null;
  pos: number;
  name: string;
  qty: number;
  unit: string;
  price: number;
  section: string;
  note: string;
  sum: number;
};

export type PriceItemDTO = {
  id: number;
  name: string;
  unit: string;
  price: number;
  category: string;
  section: string;
  source: string;
  sourceDate: string;
  note: string;
  active: boolean;
  updatedAt: string;
};

export type TemplateDTO = {
  id: number;
  name: string;
  lines: { name: string; qty: number; unit: string; price: number; hidden: boolean; section?: string }[];
};

export type DashboardDTO = {
  stats: {
    objects: number;
    acts: number;
    total: number;
    paid: number;
    photos: number;
    zeroActs: number;
    unpaidActs: number;
  };
  priceCount: number;
  debtTotal: number;
  debts: ActBrief[];
  recentActs: ActBrief[];
  activeEstimates: EstimateBrief[];
};

export type ObjectDetailDTO = {
  object: ObjectBrief;
  stages: StageBrief[];
  acts: ActBrief[];
  estimates: EstimateBrief[];
  photos: PhotoBrief[];
};

export type EstimateDetailDTO = {
  estimate: EstimateBrief;
  lines: EstimateLineDTO[];
  comments: CommentDTO[];
  object: { name: string; customer: string; clientToken: string };
};

export type ActDetailDTO = {
  act: ActBrief;
  lines: ActLineDTO[];
  payments: PaymentDTO[];
  photos: PhotoBrief[];
};

export type ClientCabinetDTO = {
  object: ObjectBrief & { masterName: string; companyName: string };
  focus: { kind: string; id: number } | null;
  stages: StageBrief[];
  estimates: EstimateBrief[];
  acts: ActBrief[];
  photos: PhotoBrief[];
  payments: { total: number; paid: number };
};

export type MeDTO = {
  authRequired: boolean;
  authed: boolean;
  configured: boolean;
  demoOpen: boolean;
  lang: "ru" | "uk";
  masterName: string;
  companyName: string;
};

export type RoomPresetDTO = {
  key: string;
  name: string;
  hint: string;
  base: { name: string; unit: string; src: "S" | "PH" | "P"; price: number; hidden: boolean }[];
};

export type ParsedLine = { name: string; qty: number; unit: string; price: number; sum: number };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const extraHeaders: Record<string, string> = {};
  if (typeof window !== "undefined") {
    try {
      const tg = sessionStorage.getItem("tg_init_data") || (window as unknown as { __tgInitData?: string }).__tgInitData;
      if (tg) extraHeaders["x-telegram-init-data"] = tg;
    } catch {}
  }
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...extraHeaders, ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Нет связи с сервером — проверьте, что dev-сервер запущен");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Ошибка сервера (${res.status})`);
  }
  return data as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  // дашборд
  dashboard: () => request<DashboardDTO>("/dashboard"),

  // объекты
  objects: () => request<ObjectBrief[]>("/objects"),
  object: (id: number) => request<ObjectDetailDTO>(`/objects/${id}`),
  createObject: (name: string, customer: string, address: string) =>
    request<ObjectBrief>("/objects", { method: "POST", body: json({ name, customer, address }) }),
  deleteObject: (id: number) => request<{ deleted: boolean }>(`/objects/${id}`, { method: "DELETE" }),

  // сметы
  estimates: (objectId?: number) =>
    request<EstimateBrief[]>(`/estimates${objectId ? `?objectId=${objectId}` : ""}`),
  estimate: (id: number) => request<EstimateDetailDTO>(`/estimates/${id}`),
  createEstimate: (objectId: number, title: string, coeff = 1, note = "") =>
    request<EstimateBrief>("/estimates", { method: "POST", body: json({ objectId, title, coeff, note }) }),
  patchEstimate: (id: number, patch: Partial<{ title: string; status: string; coeff: number; note: string }>) =>
    request<EstimateBrief>(`/estimates/${id}`, { method: "PATCH", body: json(patch) }),
  deleteEstimate: (id: number) => request<{ deleted: boolean }>(`/estimates/${id}`, { method: "DELETE" }),
  addLines: (id: number, lines: Partial<EstimateLineDTO>[]) =>
    request<{ added: number; estimate: EstimateBrief; lines: EstimateLineDTO[] }>(`/estimates/${id}/lines`, {
      method: "POST",
      body: json({ lines }),
    }),
  patchLine: (id: number, lid: number, patch: Partial<EstimateLineDTO>) =>
    request<{ line: EstimateLineDTO; estimate: EstimateBrief }>(`/estimates/${id}/lines/${lid}`, {
      method: "PATCH",
      body: json(patch),
    }),
  deleteLine: (id: number, lid: number) =>
    request<{ deleted: boolean }>(`/estimates/${id}/lines/${lid}`, { method: "DELETE" }),
  moveLine: (id: number, lid: number, dir: "up" | "down") =>
    request<{ moved: boolean }>(`/estimates/${id}/lines/${lid}/move`, { method: "POST", body: json({ dir }) }),
  estimateAct: (id: number, entries: { lineId: number; qty: number }[], period?: { from?: string; to?: string }, note = "") =>
    request<{ ok: true; actId: number; actNo: number }>(`/estimates/${id}/act`, {
      method: "POST",
      body: json({ entries, periodFrom: period?.from ?? null, periodTo: period?.to ?? null, note }),
    }),
  share: (id: number) =>
    request<{ token: string; url: string }>(`/estimates/${id}/share`, { method: "POST" }),
  approve: (id: number, opts?: { token?: string; revert?: boolean }) =>
    request<{ status: string }>(`/estimates/${id}/approve`, {
      method: "POST",
      body: json({ token: opts?.token, revert: opts?.revert }),
    }),
  comments: (id: number, token?: string) =>
    request<{ items: CommentDTO[] }>(`/estimates/${id}/comments${token ? `?token=${encodeURIComponent(token)}` : ""}`),
  addComment: (id: number, author: "master" | "client", text: string, token?: string) =>
    request<CommentDTO>(`/estimates/${id}/comments`, {
      method: "POST",
      body: json({ author, text, token }),
    }),
  applyRoom: (id: number, preset: string, area: number, height: number, perimeter?: number) =>
    request<{ added: number; lines: EstimateLineDTO[]; estimate: EstimateBrief }>(`/estimates/${id}/room`, {
      method: "POST",
      body: json({ preset, area, height, perimeter }),
    }),

  // акты и оплаты
  acts: (params?: { objectId?: number; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.objectId) qs.set("objectId", String(params.objectId));
    if (params?.q) qs.set("q", params.q);
    const s = qs.toString();
    return request<ActBrief[]>(`/acts${s ? `?${s}` : ""}`);
  },
  act: (id: number) => request<ActDetailDTO>(`/acts/${id}`),
  deleteAct: (id: number) => request<{ deleted: boolean }>(`/acts/${id}`, { method: "DELETE" }),
  addPayment: (actId: number, amount: number, note = "") =>
    request<{ payment: PaymentDTO; act: ActBrief }>(`/acts/${actId}/payments`, {
      method: "POST",
      body: json({ amount, note }),
    }),
  deletePayment: (id: number) => request<{ deleted: boolean }>(`/payments/${id}`, { method: "DELETE" }),

  // прайс
  price: (q?: string, category?: string) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (category) qs.set("category", category);
    const s = qs.toString();
    return request<{ items: PriceItemDTO[]; count: number }>(`/price${s ? `?${s}` : ""}`);
  },
  upsertPrice: (
    name: string,
    unit: string,
    price: number,
    category: string,
    extra?: { section?: string; source?: string; sourceDate?: string; note?: string }
  ) =>
    request<{ item: PriceItemDTO; prev: number; existed: boolean; changed: boolean }>("/price", {
      method: "POST",
      body: json({ name, unit, price, category, ...extra }),
    }),
  deletePrice: (name: string) =>
    request<{ deleted: boolean }>(`/price/${encodeURIComponent(name)}`, { method: "DELETE" }),
  suggest: (q: string) => request<{ items: PriceItemDTO[] }>(`/price/suggest?q=${encodeURIComponent(q)}`),

  // шаблоны
  templates: () => request<{ items: TemplateDTO[]; count: number }>("/templates"),
  upsertTemplate: (name: string, lines: TemplateDTO["lines"]) =>
    request<TemplateDTO>("/templates", { method: "POST", body: json({ name, lines }) }),
  deleteTemplate: (id: number) => request<{ deleted: boolean }>(`/templates/${id}`, { method: "DELETE" }),

  // инструменты
  parseLine: (text: string) =>
    request<{ suspicious: boolean; lines: ParsedLine[] }>("/parse-line", {
      method: "POST",
      body: json({ text }),
    }),
  roomPresets: () => request<{ items: RoomPresetDTO[] }>("/room-presets"),

  // клиентский кабинет
  client: (token: string) => request<ClientCabinetDTO>(`/client/${token}`),

  // фото (SVG-заглушки демо)
  photoURL: (id: number) => `/api/photo/${id}`,

  // --- v2: вход/настройки/фото/экспорт/бэкап ----------------------------------

  // вход
  me: () => request<MeDTO>("/auth/me"),
  login: (password: string) =>
    request<{ ok: boolean; authRequired: boolean }>("/auth/login", {
      method: "POST",
      body: json({ password }),
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  // настройки
  settings: () =>
    request<{ lang: "ru" | "uk"; masterName: string; companyName: string; hasPassword: boolean }>("/settings"),
  putSettings: (patch: Partial<{ lang: "ru" | "uk"; masterName: string; companyName: string; newPassword: string; oldPassword: string }>) =>
    request<{
      ok: boolean;
      lang: "ru" | "uk";
      masterName: string;
      companyName: string;
      hasPassword: boolean;
    }>("/settings", { method: "PUT", body: json(patch) }),

  // фото: загрузка (FormData — без JSON-заголовка), метаданные, удаление
  uploadPhotos: (
    files: File[],
    meta: {
      objectId: number;
      stageId?: number;
      actId?: number;
      estimateLineId?: number;
      kind?: string;
      caption?: string;
      takenAt?: string;
      visible?: boolean;
    }
  ) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    fd.append("objectId", String(meta.objectId));
    if (meta.stageId) fd.append("stageId", String(meta.stageId));
    if (meta.actId) fd.append("actId", String(meta.actId));
    if (meta.estimateLineId) fd.append("estimateLineId", String(meta.estimateLineId));
    if (meta.kind) fd.append("kind", meta.kind);
    if (meta.caption) fd.append("caption", meta.caption);
    if (meta.takenAt) fd.append("takenAt", meta.takenAt);
    const extraHeaders: Record<string, string> = {};
    if (typeof window !== "undefined") {
      try {
        const tg = sessionStorage.getItem("tg_init_data") || (window as unknown as { __tgInitData?: string }).__tgInitData;
        if (tg) extraHeaders["x-telegram-init-data"] = tg;
      } catch {}
    }
    return fetch("/api/photos", { method: "POST", headers: extraHeaders, body: fd }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Ошибка загрузки");
      return data as { photos: PhotoBrief[]; errors: string[] };
    });
  },
  patchPhoto: (
    id: number,
    patch: Partial<{ caption: string; visible: boolean; kind: string; takenAt: string | null; stageId: number | null; actId: number | null; estimateLineId: number | null }>
  ) =>
    request<{ ok: boolean; photo: { id: number; caption: string; visible: boolean; kind: string } }>(
      `/photo/${id}`,
      { method: "PATCH", body: json(patch) }
    ),
  deletePhoto: (id: number) => request<{ ok: boolean }>(`/photo/${id}`, { method: "DELETE" }),

  // экспорт
  exportEstimateXlsxURL: (id: number) => `/api/export/estimate/${id}`,
  exportActXlsxURL: (id: number) => `/api/export/act/${id}`,
  exportActTextURL: (id: number, lang: "ru" | "uk") => `/api/export/act-text/${id}?lang=${lang}`,

  // бэкап / восстановление
  backupURL: () => `/api/backup`,
  restoreBackup: (data: unknown) =>
    request<{ ok: boolean; counts: Record<string, number> }>("/backup/restore", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // импорт каталога
  importCatalog: (
    items: { name: string; unit: string; price: number; section?: string; source?: string; sourceDate?: string; note?: string }[],
    mode: "replace" | "merge"
  ) =>
    request<{ ok: boolean; created: number; updated: number; mode: string }>("/catalog/import", {
      method: "POST",
      body: json({ items, mode }),
    }),
};
