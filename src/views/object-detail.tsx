"use client";

// Карточка объекта v2 — фото-центр: загрузка реальных фото (файлы лежат в
// db/uploads, отдаются через /api/photo/{id}/file), галерея с типами и
// видимостью, просмотр + управление (видно клиенту / скрыть, удалить).
// Деньги, этапы-таймлайн, сметы, акты и удаление объекта — на месте.

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type ActBrief, type EstimateBrief, type PhotoBrief, type StageBrief } from "@/lib/api";
import { dateShort, dateTime, daysLeft, money, moneyShort, plural, STAGE_STATUS } from "@/lib/format";
import { useI18n, type TKey } from "@/lib/i18n";
import { navigate } from "@/lib/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ButtonSpinner,
  Empty,
  ErrorCard,
  FilterChips,
  ListSkeleton,
  ProgressRing,
  SectionHead,
  StatusBadge,
} from "@/components/kit";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  CircleDashed,
  CircleDot,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  FileImage,
  FileSpreadsheet,
  Ghost,
  HardHat,
  ImagePlus,
  Package,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Типы фото ---------- */

type PhotoKind = "progress" | "hidden" | "defect" | "material";

const KINDS: {
  value: PhotoKind;
  key: TKey;
  icon: React.ComponentType<{ className?: string }>;
  badge: string;
}[] = [
  { value: "progress", key: "photosKindProgress", icon: Camera, badge: "border-white/20 bg-black/55 text-white backdrop-blur-sm" },
  // скрытые работы — особый, фирменный янтарный цвет
  { value: "hidden", key: "photosKindHidden", icon: Ghost, badge: "border-primary/60 bg-primary/90 text-primary-foreground backdrop-blur-sm" },
  { value: "defect", key: "photosKindDefect", icon: AlertTriangle, badge: "border-danger/60 bg-danger/85 text-white backdrop-blur-sm" },
  { value: "material", key: "photosKindMaterial", icon: Package, badge: "border-warn/60 bg-warn/85 text-white backdrop-blur-sm" },
];

function kindMeta(kind: string) {
  return KINDS.find((k) => k.value === kind) ?? KINDS[0];
}

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

/* ---------- Этапы: иконка статуса ---------- */

function StageIcon({ status }: { status: string }) {
  if (status === "done") return <Check className="size-3.5 text-primary-foreground" />;
  if (status === "current") return <CircleDot className="size-3.5 text-primary" />;
  if (status === "next") return <Clock className="size-3.5 text-warn" />;
  return <CircleDashed className="size-3.5 text-muted-foreground" />;
}

/* ---------- Плитка фото в галерее ---------- */

function PhotoTile({ p, t, onOpen }: { p: PhotoBrief; t: (key: TKey) => string; onOpen: () => void }) {
  const meta = kindMeta(p.kind);
  const KindIcon = meta.icon;
  const when = p.takenAt ?? p.createdAt;
  return (
    <figure
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={p.caption || t(meta.key)}
      className="pressable group relative cursor-pointer overflow-hidden rounded-xl border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img
        src={p.thumbUrl}
        alt={p.caption || t(meta.key)}
        loading="lazy"
        className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
      />
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
            meta.badge,
          )}
        >
          <KindIcon className="size-2.5" />
          <span className="hidden sm:inline">{t(meta.key)}</span>
        </span>
        {!p.visible && (
          <span
            title={t("photosHiddenFromClient")}
            className="inline-flex items-center rounded-full border border-danger/60 bg-black/65 px-1.5 py-0.5 text-white backdrop-blur-sm"
          >
            <EyeOff className="size-2.5" />
          </span>
        )}
      </div>
      {(p.caption || p.actNo > 0) && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent p-2 pt-7 text-left">
          {p.caption && <span className="block truncate text-[11px] font-medium text-white">{p.caption}</span>}
          <span className="num block text-[10px] text-white/75">
            {dateShort(when)}
            {p.actNo > 0 && ` · акт №${p.actNo}`}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

/* ---------- Диалог загрузки фото (главная фича) ---------- */

function UploadPhotosDialog({
  open,
  onOpenChange,
  objectId,
  stages,
  acts,
  estimates,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  objectId: number;
  stages: StageBrief[];
  acts: ActBrief[];
  estimates: EstimateBrief[];
}) {
  const { t, lang } = useI18n();
  const uk = lang === "uk";
  const qc = useQueryClient();
  const [files, setFiles] = React.useState<File[]>([]);
  const [caption, setCaption] = React.useState("");
  const [kind, setKind] = React.useState<PhotoKind>("progress");
  const [takenAt, setTakenAt] = React.useState("");
  const [stageId, setStageId] = React.useState("none");
  const [actId, setActId] = React.useState("none");
  const [lineId, setLineId] = React.useState("none");
  const [visible, setVisible] = React.useState(true);
  const [dragOver, setDragOver] = React.useState(false);

  const reset = () => {
    setFiles([]);
    setCaption("");
    setKind("progress");
    setTakenAt("");
    setStageId("none");
    setActId("none");
    setLineId("none");
    setVisible(true);
  };

  // строки смет объекта — чтобы привязать фото к работе (скрытой в том числе)
  const linesQuery = useQuery({
    queryKey: ["object", objectId, "estimate-lines"],
    queryFn: async () => {
      const details = await Promise.all(estimates.map((e) => api.estimate(e.id)));
      return details.flatMap((d) =>
        d.lines.map((l) => ({ id: l.id, name: l.name, hidden: l.hidden, estimateTitle: d.estimate.title })),
      );
    },
    enabled: open && estimates.length > 0,
    staleTime: 60_000,
  });

  const upload = useMutation({
    mutationFn: () =>
      api.uploadPhotos(files, {
        objectId,
        stageId: stageId !== "none" ? Number(stageId) : undefined,
        actId: actId !== "none" ? Number(actId) : undefined,
        estimateLineId: lineId !== "none" ? Number(lineId) : undefined,
        kind,
        caption: caption.trim() || undefined,
        takenAt: takenAt || undefined,
        visible,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["object", objectId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (res.photos.length > 0) {
        toast.success(
          `${uk ? "Завантажено" : "Загружено"} ${res.photos.length} ${uk ? plural(res.photos.length, "фото", "фото", "фото") : plural(res.photos.length, "фото", "фото", "фото")}`,
          {
            description:
              res.errors.length > 0
                ? `${uk ? "Не збереглися" : "Не сохранились"}: ${res.errors.join("; ")}`
                : undefined,
          },
        );
      }
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(uk ? "Завантаження не вдалося" : "Загрузка не удалась", { description: e.message }),
  });

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (incoming.length === 0) {
      toast.error(uk ? "Лише JPEG, PNG або WebP" : "Только JPEG, PNG или WebP");
      return;
    }
    if (files.length + incoming.length > 10) {
      toast.error(uk ? "Максимум 10 фото за раз" : "Максимум 10 фото за раз", {
        description: `${uk ? "Додано" : "Добавлено"} ${Math.max(0, 10 - files.length)} ${uk ? "з" : "из"} ${incoming.length}`,
      });
    }
    setFiles([...files, ...incoming].slice(0, 10));
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (upload.isPending) return;
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="scroll-thin max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("photosUpload")}</DialogTitle>
          <DialogDescription>
            {uk
              ? "JPEG, PNG або WebP, до 10 файлів. Фото потраплять до кабінету замовника — якщо увімкнено видимість."
              : "JPEG, PNG или WebP, до 10 файлов. Фото попадут в кабинет заказчика — если включена видимость."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* дропзона / выбор файлов */}
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
              dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-accent/40",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => {
                addFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            <ImagePlus className="size-6 text-primary" />
            <span className="text-sm font-semibold">{uk ? "Перетягніть фото сюди" : "Перетащите фото сюда"}</span>
            <span className="text-xs text-muted-foreground">
              {uk ? "або натисніть, щоб обрати файли" : "или нажмите, чтобы выбрать файлы"}
            </span>
          </label>

          {/* выбранные файлы */}
          {files.length > 0 && (
            <ul className="scroll-thin max-h-36 space-y-1.5 overflow-y-auto">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}-${f.size}`}
                  className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5"
                >
                  <FileImage className="size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{f.name}</span>
                  <span className="num shrink-0 text-[11px] text-muted-foreground">{fmtSize(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="pressable shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={`${uk ? "Прибрати файл" : "Убрать файл"} ${f.name}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* подпись */}
          <div className="space-y-1.5">
            <Label htmlFor="photo-caption">{t("photosCaption")}</Label>
            <Input
              id="photo-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={uk ? "Наприклад: штроблення стін, вітальня" : "Например: штробление стен, гостиная"}
            />
          </div>

          {/* тип + дата съёмки */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Тип</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as PhotoKind)}>
                <SelectTrigger className="w-full" aria-label="Тип фото">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => {
                    const KindIcon = k.icon;
                    return (
                      <SelectItem key={k.value} value={k.value}>
                        <span className="flex items-center gap-1.5">
                          <KindIcon className="size-3.5" />
                          {t(k.key)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="photo-taken-at">{cap(t("photosTakenAt"))}</Label>
              <Input
                id="photo-taken-at"
                type="date"
                value={takenAt}
                max={today}
                onChange={(e) => setTakenAt(e.target.value)}
              />
            </div>
          </div>

          {/* привязки: этап + акт */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{cap(t("photosLinkStage"))}</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{cap(t("photosLinkAct"))}</Label>
              <Select value={actId} onValueChange={setActId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {acts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {t("actNumber")}{a.actNo} · {dateShort(a.date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* привязка к строке сметы (скрытые работы) */}
          <div className="space-y-1.5">
            <Label>{cap(t("photosLinkLine"))}</Label>
            <Select value={lineId} onValueChange={setLineId} disabled={estimates.length === 0 || linesQuery.isLoading}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {(linesQuery.data ?? []).map((l) => (
                  <SelectItem key={l.id} value={String(l.id)} className="whitespace-normal">
                    <span className="flex items-center gap-1.5">
                      {l.hidden && <Ghost className="size-3 shrink-0 text-primary" />}
                      <span className="truncate">{l.name}</span>
                      <span className="shrink-0 text-muted-foreground">· {l.estimateTitle}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {linesQuery.error && (
              <p className="text-[11px] text-danger">
                {uk
                  ? "Не вдалося завантажити рядки кошторисів — прив'язка недоступна"
                  : "Не удалось загрузить строки смет — привязка недоступна"}
              </p>
            )}
          </div>

          {/* видимость клиенту */}
          <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5">
            <div className="min-w-0">
              <Label htmlFor="photo-visible" className="text-[13px]">
                {t("photosVisible")}
              </Label>
              <p className="text-[11px] leading-snug text-muted-foreground">{t("photosVisibleHint")}</p>
            </div>
            <Switch id="photo-visible" checked={visible} onCheckedChange={setVisible} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={upload.isPending} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button disabled={files.length === 0 || upload.isPending} onClick={() => upload.mutate()}>
            {upload.isPending ? <ButtonSpinner /> : <Upload className="size-4" />}
            {upload.isPending ? t("photosUploading") : t("photosUpload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Просмотр фото + управление ---------- */

function PhotoViewer({
  photo,
  stages,
  acts,
  onClose,
  onToggleVisible,
  onDelete,
  toggling,
  deleting,
}: {
  photo: PhotoBrief;
  stages: StageBrief[];
  acts: ActBrief[];
  onClose: () => void;
  onToggleVisible: (p: PhotoBrief) => void;
  onDelete: (id: number) => void;
  toggling: boolean;
  deleting: boolean;
}) {
  const { t, lang } = useI18n();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const meta = kindMeta(photo.kind);
  const KindIcon = meta.icon;
  const stage = stages.find((s) => s.id === photo.stageId);
  const act = acts.find((a) => a.id === photo.actId);

  return (
    <>
      <Dialog
        open
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
      >
        <DialogContent className="scroll-thin max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-left">{photo.caption || t(meta.key)}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-left">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                  meta.badge,
                )}
              >
                <KindIcon className="size-2.5" />
                {t(meta.key)}
              </span>
              <span>{photo.takenAt ? dateShort(photo.takenAt) : dateTime(photo.createdAt)}</span>
              {stage && (
                <span>
                  · {t("photosLinkStage")}: {stage.title}
                </span>
              )}
              {act && (
                <span>
                  · {t("photosLinkAct")} №{act.actNo}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <img
            src={photo.fileUrl}
            alt={photo.caption || t(meta.key)}
            className="max-h-[52dvh] w-full rounded-xl border bg-muted object-contain"
          />
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={toggling}
              onClick={() => onToggleVisible(photo)}
              className="w-full sm:w-auto"
            >
              {photo.visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {photo.visible ? t("photosHiddenFromClient") : t("photosVisible")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={() => setConfirmDelete(true)}
              className="w-full sm:w-auto"
            >
              <Trash2 className="size-4" /> {t("photosDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("photosDelete")}?</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "uk"
                ? "Фото зникне з кабінету замовника та звітів. Дію не можна відмінити."
                : "Фото пропадёт из кабинета заказчика и отчётов. Действие необратимо."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => onDelete(photo.id)}>
              {deleting ? (lang === "uk" ? "Видаляємо…" : "Удаляем…") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ---------- Экран: карточка объекта ---------- */

export function ObjectDetailView({ id }: { id: number }) {
  const { t, lang } = useI18n();
  const uk = lang === "uk";
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [viewPhotoId, setViewPhotoId] = React.useState<number | null>(null);
  const [kindFilter, setKindFilter] = React.useState<PhotoKind | "all">("all");
  const galleryRef = React.useRef<HTMLElement | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["object", id],
    queryFn: () => api.object(id),
  });

  const del = useMutation({
    mutationFn: () => api.deleteObject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(uk ? "Об'єкт видалено" : "Объект удалён", {
        description: uk ? "Разом з актами, кошторисами і фото (демо)" : "Вместе с актами, сметами и фото (демо)",
      });
      navigate("#/objects");
    },
    onError: (e) => toast.error(uk ? "Не видалилось" : "Не удалилось", { description: e.message }),
  });

  const patchPhoto = useMutation({
    mutationFn: (vars: { pid: number; visible: boolean }) => api.patchPhoto(vars.pid, { visible: vars.visible }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["object", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(vars.visible ? t("photosVisible") : t("photosHiddenFromClient"));
    },
    onError: (e) => toast.error(uk ? "Не вдалося оновити фото" : "Не удалось обновить фото", { description: e.message }),
  });

  const deletePhoto = useMutation({
    mutationFn: (pid: number) => api.deletePhoto(pid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["object", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(uk ? "Фото видалено" : "Фото удалено");
    },
    onError: (e) => toast.error(uk ? "Не вдалося видалити фото" : "Не удалось удалить фото", { description: e.message }),
  });

  if (isLoading) return <ListSkeleton rows={5} height="h-28" />;
  if (error || !data)
    return (
      <div className="space-y-4 fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate("#/objects")}>
          ← {uk ? "До об'єктів" : "К объектам"}
        </Button>
        {error ? (
          <ErrorCard message={error.message} onRetry={() => refetch()} />
        ) : (
          <Empty
            icon={HardHat}
            title={uk ? "Об'єкт не знайдено" : "Объект не найден"}
            sub={uk ? "Можливо, його було видалено" : "Возможно, он был удалён"}
          />
        )}
      </div>
    );

  const { object: o, stages, acts, estimates, photos } = data;
  const dl = o.deadline ? daysLeft(o.deadline) : null;
  const viewPhoto = viewPhotoId == null ? null : (photos.find((p) => p.id === viewPhotoId) ?? null);

  const kindCounts = new Map<string, number>();
  for (const p of photos) kindCounts.set(p.kind, (kindCounts.get(p.kind) ?? 0) + 1);
  const shown = kindFilter === "all" ? photos : photos.filter((p) => p.kind === kindFilter);

  return (
    <div className="space-y-5 fade-in">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("#/objects")}>
        ← {uk ? "До об'єктів" : "К объектам"}
      </Button>

      {/* Шапка объекта */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">{o.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <User className="size-3" /> {o.customer}
            </span>
            {o.address && <span>{o.address}</span>}
            {dl && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" />
                {o.status === "done" ? (uk ? "об'єкт зданий" : "объект сдан") : `${uk ? "здача" : "сдача"} ${dl.text}`}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge kind="object" value={o.status} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`#/client/${o.clientToken}`)}
            title={uk ? "Подивитись, що бачить замовник" : "Посмотреть, что видит заказчик"}
          >
            <User className="size-4" /> {t("navClient")}
          </Button>
        </div>
      </div>

      {/* Деньги и прогресс */}
      <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
        <Card className="border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card">
          <CardContent className="flex items-center gap-4 p-5">
            <ProgressRing value={o.progress} size={84} sub="готово" />
            <div className="min-w-0 space-y-1 leading-tight">
              <p className="num text-2xl font-extrabold">{money(o.total)}</p>
              <p className="text-xs text-muted-foreground">{uk ? "виконано за актами" : "выполнено по актам"}</p>
              <Separator className="my-2" />
              <p className="text-xs">
                {uk ? "сплачено" : "оплачено"} <b className="num">{moneyShort(o.paid)}</b>
                {o.debt > 0.01 ? (
                  <span className="text-danger">
                    {" "}
                    · {uk ? "борг" : "долг"} <b className="num">{moneyShort(o.debt)}</b>
                  </span>
                ) : (
                  <span className="text-ok"> · {uk ? "повністю" : "полностью"}</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Этапы */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <SectionHead title={uk ? "Етапи будівництва" : "Этапы стройки"} className="mb-3" />
            <ol className="relative space-y-0">
              {stages.map((s, i) => {
                const isLast = i === stages.length - 1;
                const tone =
                  s.status === "done"
                    ? "bg-primary text-primary-foreground"
                    : s.status === "current"
                      ? "border-2 border-primary text-primary"
                      : s.status === "next"
                        ? "border-2 border-warn text-warn"
                        : "border-2 border-border text-muted-foreground";
                return (
                  <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {!isLast && <span className="absolute left-[11px] top-6 h-full w-px bg-border" aria-hidden />}
                    <span
                      className={`relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${tone} ${s.status === "done" ? "" : "bg-card"}`}
                    >
                      <StageIcon status={s.status} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <p className={`text-sm font-semibold ${s.status === "todo" ? "text-muted-foreground" : ""}`}>
                          {s.title}
                        </p>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {STAGE_STATUS[s.status]?.label}
                        </span>
                        {s.doneAt && <span className="text-[11px] text-muted-foreground">· {dateShort(s.doneAt)}</span>}
                      </div>
                      {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
                      {s.photos.length > 0 && (
                        <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                          {s.photos.slice(0, 8).map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setViewPhotoId(p.id)}
                              title={p.caption || s.title}
                              className="pressable overflow-hidden rounded-lg border"
                            >
                              <img
                                src={p.thumbUrl}
                                alt={p.caption || s.title}
                                loading="lazy"
                                className="aspect-[4/3] w-full object-cover transition-transform hover:scale-[1.05]"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* Сметы объекта */}
      <section className="space-y-2.5">
        <SectionHead
          title={t("estimatesTitle")}
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate("#/estimates")}>
              {uk ? "Усі кошториси" : "Все сметы"} <ChevronRight className="size-3.5" />
            </Button>
          }
        />
        {estimates.length === 0 ? (
          <Empty
            className="py-6"
            icon={FileSpreadsheet}
            title={uk ? "Кошторисів на об'єкті немає" : "Смет на объекте нет"}
            sub={
              uk
                ? "Кошторис — план робіт до ремонту: позиції з прайсу, прихована підготовка, коефіцієнт складності."
                : "Смета — план работ до ремонта: позиции из прайса, скрытая подготовка, коэффициент сложности."
            }
            action={
              <Button size="sm" onClick={() => navigate("#/estimates?new=1")}>
                {uk ? "Створити кошторис" : "Создать смету"}
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="divide-y divide-border/70 p-0">
              {estimates.map((est) => (
                <button
                  key={est.id}
                  type="button"
                  onClick={() => navigate(`#/estimates/${est.id}`)}
                  className="pressable flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                >
                  <FileSpreadsheet className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-sm font-semibold">{est.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {est.lines}{" "}
                      {uk ? plural(est.lines, "позиція", "позиції", "позицій") : plural(est.lines, "позиция", "позиции", "позиций")}
                      {est.hiddenShare > 0 && ` · ${uk ? "прихованих" : "скрытых"} ${est.hiddenShare}%`}
                      {est.coeff !== 1 && ` · ${uk ? "коеф" : "коэфф"} ×${String(est.coeff).replace(".", ",")}`}
                    </p>
                  </div>
                  <span className="num text-sm font-bold">{money(est.total)}</span>
                  <StatusBadge kind="estimate" value={est.status} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Акты объекта */}
      <section className="space-y-2.5">
        <SectionHead
          title={`${uk ? "Акти" : "Акты"} (${acts.length})`}
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate(`#/acts?objectId=${o.id}`)}>
              {uk ? "Усі акти" : "Все акты"} <ChevronRight className="size-3.5" />
            </Button>
          }
        />
        {acts.length === 0 ? (
          <Empty
            className="py-6"
            icon={ClipboardList}
            title={uk ? "Актів немає" : "Актов нет"}
            sub={uk ? "Акт створюється з позначених рядків кошторису" : "Акт создаётся из отмеченных строк сметы"}
          />
        ) : (
          <Card>
            <CardContent className="divide-y divide-border/70 p-0">
              {acts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => navigate(`#/acts/${a.id}`)}
                  className="pressable flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="text-sm font-semibold">{t("actNumber")}{a.actNo}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {dateShort(a.date)} · {uk ? "сплачено" : "оплачено"} {moneyShort(a.paid)} {uk ? "з" : "из"} {moneyShort(a.total)}
                      {a.photos > 0 && (
                        <span className="ml-1 inline-flex items-center gap-0.5">
                          · <Camera className="size-3" /> {a.photos}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="num text-sm font-bold">{money(a.total)}</span>
                  <StatusBadge kind="act" value={a.status} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Фото-центр */}
      <section ref={galleryRef} className="space-y-2.5">
        <SectionHead
          title={`${uk ? "Фото об'єкта" : "Фото объекта"} (${photos.length})`}
          action={
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="size-4" /> {t("photosUpload")}
            </Button>
          }
        />
        <FilterChips
          value={kindFilter}
          onChange={setKindFilter}
          options={[
            { value: "all", label: t("all"), count: photos.length },
            ...KINDS.map((k) => ({ value: k.value, label: cap(t(k.key)), count: kindCounts.get(k.value) ?? 0 })),
          ]}
        />
        {shown.length === 0 ? (
          <Empty
            className="py-6"
            icon={Camera}
            title={
              photos.length === 0
                ? uk
                  ? "Фото поки немає"
                  : "Фото пока нет"
                : uk
                  ? "У цьому типі фото немає"
                  : "В этом типе фото нет"
            }
            sub={
              photos.length === 0
                ? uk
                  ? "Завантажте фото з телефона: прогрес, приховані роботи, дефекти і матеріали — клієнт побачить їх у кабінеті"
                  : "Загрузите фото с телефона: прогресс, скрытые работы, дефекты и материалы — клиент увидит их в кабинете"
                : undefined
            }
            action={
              photos.length === 0 ? (
                <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
                  <Upload className="size-4" /> {t("photosUpload")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((p) => (
              <PhotoTile key={p.id} p={p} t={t} onOpen={() => setViewPhotoId(p.id)} />
            ))}
          </div>
        )}
      </section>

      {/* Опасная зона */}
      <Card className="border-danger/25">
        <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{uk ? "Видалити об'єкт" : "Удалить объект"}</p>
            <p className="text-xs text-muted-foreground">
              {uk
                ? "Разом з актами, кошторисами, оплатами і фото. У демо — одразу і безповоротно."
                : "Вместе с актами, сметами, оплатами и фото. В демо — сразу и безвозвратно."}
            </p>
          </div>
          <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="size-4" /> {t("delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {uk ? "Видалити" : "Удалить"} «{o.name}»?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {uk
                    ? `Зникнуть ${acts.length} ${plural(acts.length, "акт", "акти", "актів")}, ${estimates.length} ${plural(estimates.length, "кошторис", "кошториси", "кошторисів")} і ${photos.length} фото. Дію не можна відмінити.`
                    : `Уйдут ${acts.length} ${plural(acts.length, "акт", "акта", "актов")}, ${estimates.length} ${plural(estimates.length, "смета", "сметы", "смет")} и ${photos.length} ${plural(photos.length, "фото", "фото", "фото")}. Действие необратимо.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{uk ? "Залишити" : "Оставить"}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => del.mutate()}
                >
                  {del.isPending ? (uk ? "Видаляємо…" : "Удаляем…") : uk ? "Так, видалити" : "Да, удалить"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Диалоги фото-центра */}
      <UploadPhotosDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        objectId={o.id}
        stages={stages}
        acts={acts}
        estimates={estimates}
      />
      {viewPhoto && (
        <PhotoViewer
          photo={viewPhoto}
          stages={stages}
          acts={acts}
          onClose={() => setViewPhotoId(null)}
          onToggleVisible={(p) => patchPhoto.mutate({ pid: p.id, visible: !p.visible })}
          onDelete={(pid) => deletePhoto.mutate(pid)}
          toggling={patchPhoto.isPending}
          deleting={deletePhoto.isPending}
        />
      )}
    </div>
  );
}
