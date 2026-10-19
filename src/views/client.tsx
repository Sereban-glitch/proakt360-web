"use client";

// Кабинет заказчика v2 — вход по персональной ссылке (токен объекта, сметы
// или акта — бэкенд сам разрезолвит и вернёт focus). Язык — из locale объекта
// (uk/ru). Прогресс, расчёты (MoneyBar), этапы с фото, смета со согласованием
// и вопросами, акты, фотоотчёт. Standalone-экран без шелла мастера.

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, type ActBrief, type EstimateBrief, type PhotoBrief, type StageBrief } from "@/lib/api";
import { money, moneyShort } from "@/lib/format";
import { dictFor, useI18n, type Lang, type TKey } from "@/lib/i18n";
import { navigate } from "@/lib/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BrandMark,
  BrandWordmark,
  CopyButton,
  Empty,
  ErrorCard,
  ListSkeleton,
  MoneyBar,
  ProgressRing,
} from "@/components/kit";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  CircleDashed,
  CircleDot,
  Clock,
  Ghost,
  Link2,
  MessageSquare,
  Printer,
  Send,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Локализация для клиента (locale объекта, а не мастера) ---------- */

/** Переводчик по словарю: dictFor возвращает Record, оборачиваем в (key) => string. */
type LT = (key: TKey) => string;

function ltFor(lang: Lang): LT {
  const d = dictFor(lang);
  return (key) => d[key] ?? key;
}

const MONTHS: Record<Lang, { short: string[]; full: string[] }> = {
  ru: {
    short: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
    full: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  },
  uk: {
    short: ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"],
    full: ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"],
  },
};

function dateShort(iso: string, lang: Lang): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[lang].short[d.getMonth()]}`;
}

function dateFull(iso: string, lang: Lang): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[lang].full[d.getMonth()]} ${d.getFullYear()}`;
}

function dateTime(iso: string, lang: Lang): string {
  const d = new Date(iso);
  return `${dateShort(iso, lang)}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Множественные числа для ru и uk (правила одни и те же, формы разные). */
function plural(n: number, lang: Lang, ru: [string, string, string], uk: [string, string, string]): string {
  const f = lang === "uk" ? uk : ru;
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return f[2];
  if (d === 1) return f[0];
  if (d >= 2 && d <= 4) return f[1];
  return f[2];
}

function deadlineText(iso: string, lang: Lang, done: boolean): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  if (done) return lang === "uk" ? "об'єкт зданий" : "объект сдан";
  if (days === 0) return lang === "uk" ? "здача сьогодні" : "сдача сегодня";
  if (days > 0)
    return `${lang === "uk" ? "планова здача" : "плановая сдача"}: ${days} ${plural(days, lang, ["день", "дня", "дней"], ["день", "дні", "днів"])}`;
  return `${-days} ${plural(-days, lang, ["день", "дня", "дней"], ["день", "дні", "днів"])} ${lang === "uk" ? "тому" : "назад"}`;
}

const STAGE_LABEL: Record<Lang, Record<string, string>> = {
  ru: { done: "Готово", current: "Сейчас", next: "Далее", todo: "Впереди" },
  uk: { done: "Готово", current: "Зараз", next: "Далі", todo: "Попереду" },
};

function kindLabel(kind: string, lt: LT): string {
  if (kind === "hidden") return lt("photosKindHidden");
  if (kind === "defect") return lt("photosKindDefect");
  if (kind === "material") return lt("photosKindMaterial");
  return lt("photosKindProgress");
}

function actStatusText(status: string, lt: LT): string {
  if (status === "paid") return lt("actStatusPaid");
  if (status === "partial") return lt("actStatusPartial");
  if (status === "unpaid") return lt("actStatusUnpaid");
  return "—";
}

function actStatusTone(status: string): string {
  if (status === "paid") return "border-ok/30 bg-ok-soft text-ok";
  if (status === "partial") return "border-warn/30 bg-warn-soft text-warn";
  if (status === "unpaid") return "border-danger/30 bg-danger-soft text-danger";
  return "border-border bg-muted/60 text-muted-foreground";
}

function estStatusText(status: string, lt: LT): string {
  if (status === "draft") return lt("estimateStatusDraft");
  if (status === "sent") return lt("estimateStatusSent");
  if (status === "approved") return lt("estimateStatusApproved");
  return lt("estimateStatusDone");
}

function estStatusTone(status: string): string {
  if (status === "sent") return "border-warn/30 bg-warn-soft text-warn";
  if (status === "approved") return "border-ok/30 bg-ok-soft text-ok";
  if (status === "done") return "border-transparent bg-secondary text-secondary-foreground";
  return "border-border bg-muted/60 text-muted-foreground";
}

function ClientBadge({ text, tone }: { text: string; tone: string }) {
  return (
    <Badge variant="outline" className={cn("px-2 py-0 text-[11px] font-semibold whitespace-nowrap", tone)}>
      {text}
    </Badge>
  );
}

/* ---------- Каркас ---------- */

function DemoFooter() {
  const { lang } = useI18n();
  return (
    <footer className="mt-auto border-t border-border/70 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-1 text-center">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {lang === "uk" ? "Кабінет замовника · «ПрорАКТ 360»" : "Кабинет заказчика · «ПрорАКТ 360»"}
        </p>
        <button
          type="button"
          className="text-[11px] text-primary underline underline-offset-2"
          onClick={() => navigate("#/")}
        >
          {lang === "uk" ? "Повернутися на робочий стіл" : "Вернуться на рабочий стол"}
        </button>
      </div>
    </footer>
  );
}

/* ---------- Плитка фото (клиент видит только visible — отфильтровано сервером) ---------- */

function PhotoTile({
  p,
  lt,
  lang,
  onOpen,
}: {
  p: PhotoBrief;
  lt: LT;
  lang: Lang;
  onOpen: () => void;
}) {
  const when = p.takenAt ?? p.createdAt;
  const kind = kindLabel(p.kind, lt);
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
      aria-label={p.caption || kind}
      className="pressable group relative cursor-pointer overflow-hidden rounded-xl border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img
        src={p.thumbUrl}
        alt={p.caption || kind}
        loading="lazy"
        className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
      />
      {p.kind !== "progress" && (
        <span
          className={cn(
            "absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide backdrop-blur-sm",
            p.kind === "hidden"
              ? "border-primary/60 bg-primary/90 text-primary-foreground"
              : p.kind === "defect"
                ? "border-danger/60 bg-danger/85 text-white"
                : "border-warn/60 bg-warn/85 text-white",
          )}
        >
          {p.kind === "hidden" && <Ghost className="size-2.5" />}
          <span className="hidden sm:inline">{kind}</span>
        </span>
      )}
      {(p.caption || p.actNo > 0) && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent p-2 pt-7 text-left">
          {p.caption && <span className="block truncate text-[11px] font-medium text-white">{p.caption}</span>}
          <span className="num block text-[10px] text-white/75">
            {dateShort(when, lang)}
            {p.actNo > 0 && ` · ${lt("actNumber")} ${p.actNo}`}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

/* ---------- Этап с фото ---------- */

function ClientStageCard({
  s,
  lt,
  lang,
  onOpenPhoto,
}: {
  s: StageBrief;
  lt: LT;
  lang: Lang;
  onOpenPhoto: (id: number) => void;
}) {
  const tone =
    s.status === "done"
      ? "bg-primary text-primary-foreground"
      : s.status === "current"
        ? "border-2 border-primary text-primary"
        : s.status === "next"
          ? "border-2 border-warn text-warn"
          : "border-2 border-border text-muted-foreground";
  return (
    <Card className={cn(s.status === "todo" && "opacity-60")}>
      <CardContent className="flex gap-3.5 p-4">
        <div className="flex flex-col items-center">
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-full ${tone} ${s.status === "done" ? "" : "bg-card"}`}
          >
            {s.status === "done" ? (
              <Check className="size-4 text-primary-foreground" />
            ) : s.status === "current" ? (
              <CircleDot className="size-4" />
            ) : s.status === "next" ? (
              <Clock className="size-4" />
            ) : (
              <CircleDashed className="size-4" />
            )}
          </span>
          <span className="mt-1 w-px flex-1 bg-border" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="text-[15px] font-bold leading-tight">{s.title}</p>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {STAGE_LABEL[lang][s.status] ?? ""}
            </span>
            {s.doneAt && <span className="text-[11px] text-muted-foreground">· {dateFull(s.doneAt, lang)}</span>}
          </div>
          {s.note && <p className="text-[13px] text-muted-foreground">{s.note}</p>}
          {s.photos.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {s.photos.slice(0, 3).map((p) => (
                <PhotoTile key={p.id} p={p} lt={lt} lang={lang} onOpen={() => onOpenPhoto(p.id)} />
              ))}
            </div>
          )}
          {s.status === "current" && s.photos.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Camera className="size-3" />
              {lang === "uk"
                ? "фото приходить в міру готовності — без нагадувань"
                : "фотоэтап приходит по мере готовности — без напоминаний"}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Акт в кабинете ---------- */

function ClientActCard({
  act,
  photos,
  lt,
  lang,
  focusRef,
  focused,
  onOpenPhoto,
}: {
  act: ActBrief;
  photos: PhotoBrief[];
  lt: LT;
  lang: Lang;
  focusRef?: (el: HTMLElement | null) => void;
  focused: boolean;
  onOpenPhoto: (id: number) => void;
}) {
  const actPhotos = photos.filter((p) => p.actId === act.id);
  const debt = act.total - act.paid;
  return (
    <div ref={focusRef} className="scroll-mt-24">
      <Card className={cn(focused && "ring-2 ring-primary/50")}>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[15px] font-bold">
              {lt("actNumber")} {act.actNo}
            </p>
            <ClientBadge text={actStatusText(act.status, lt)} tone={actStatusTone(act.status)} />
          </div>
          <p className="text-xs text-muted-foreground">
            {dateFull(act.date, lang)}
            {act.periodFrom && act.periodTo && (
              <>
                {" · "}
                {lt("actPeriod")}: {dateShort(act.periodFrom, lang)} — {dateShort(act.periodTo, lang)}
              </>
            )}
          </p>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{lt("actTotal")}</span>
              <b className="num">{money(act.total)}</b>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{lt("actPaid")}</span>
              <span className="num">{money(act.paid)}</span>
            </div>
            {debt > 0.01 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-warn">{lt("actDebt")}</span>
                <b className="num text-warn">{money(debt)}</b>
              </div>
            )}
          </div>
          {actPhotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {actPhotos.map((p) => (
                <PhotoTile key={p.id} p={p} lt={lt} lang={lang} onOpen={() => onOpenPhoto(p.id)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Смета в кабинете заказчика ---------- */

function ClientEstimateCard({
  brief,
  token,
  lt,
  lang,
  defaultOpen,
  focused,
}: {
  brief: EstimateBrief;
  token: string;
  lt: LT;
  lang: Lang;
  defaultOpen: boolean;
  focused: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(defaultOpen);
  const [comment, setComment] = React.useState("");

  React.useEffect(() => {
    if (focused) setOpen(true);
  }, [focused]);

  // полный состав строк нужен только при раскрытии; если мастер закрыл вход
  // паролем — деградируем до сумм из брифа (кабинет остаётся рабочим)
  const detail = useQuery({
    queryKey: ["estimate", brief.id],
    queryFn: () => api.estimate(brief.id),
    enabled: open,
  });

  const comments = useQuery({
    queryKey: ["comments", brief.id, token],
    queryFn: () => api.comments(brief.id, token),
    enabled: open,
  });

  const approve = useMutation({
    mutationFn: () => api.approve(brief.id, { token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client", token] });
      qc.invalidateQueries({ queryKey: ["estimate", brief.id] });
      toast.success(lt("estimateApproved"));
    },
    onError: (e) =>
      toast.error(lang === "uk" ? "Не вдалося погодити" : "Не удалось согласовать", { description: e.message }),
  });

  const addComment = useMutation({
    mutationFn: () => api.addComment(brief.id, "client", comment.trim(), token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", brief.id, token] });
      setComment("");
      toast.success(lt("clientCommentSent"));
    },
    onError: (e) =>
      toast.error(lang === "uk" ? "Не надіслалось" : "Не отправилось", { description: e.message }),
  });

  const est = detail.data?.estimate;
  const lines = detail.data?.lines ?? null;
  const visible = lines?.filter((l) => !l.hidden) ?? [];
  const hidden = lines?.filter((l) => l.hidden) ?? [];
  const coeff = est?.coeff ?? brief.coeff;
  const status = est?.status ?? brief.status;

  const lineRow = (l: { id: number; name: string; qty: number; unit: string; price: number; sum: number }) => (
    <div key={l.id} className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 truncate text-xs sm:text-sm">{l.name}</span>
      <span className="num shrink-0 text-[11px] sm:text-xs text-muted-foreground">
        {l.qty.toString().replace(".", ",")} {l.unit} × {moneyShort(l.price, lang)}
      </span>
      <span className="num w-16 sm:w-20 shrink-0 text-right font-semibold text-xs sm:text-sm">{money(l.sum * coeff)}</span>
    </div>
  );

  return (
    <Card className={cn("overflow-hidden", focused && "ring-2 ring-primary/50")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pressable flex w-full items-center gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-bold">{brief.title}</p>
          <p className="text-xs text-muted-foreground">
            {brief.lines} {plural(brief.lines, lang, ["позиция", "позиции", "позиций"], ["позиція", "позиції", "позицій"])}
            {coeff !== 1 && ` · ${lt("estimateCoeff")} ×${String(coeff).replace(".", ",")}`}
            {brief.hiddenShare > 0 && ` · ${lt("estimateHidden")} ${brief.hiddenShare}%`}
          </p>
        </div>
        <span className="num shrink-0 text-lg font-extrabold">{money(brief.total)}</span>
        <ClientBadge text={estStatusText(status, lt)} tone={estStatusTone(status)} />
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-border/70 p-4 pt-3">
          {detail.isLoading ? (
            <ListSkeleton rows={2} height="h-8" />
          ) : lines ? (
            <>
              {/* видимая часть */}
              {visible.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {lt("estimateVisible")}
                  </p>
                  {visible.map(lineRow)}
                </div>
              )}

              {/* скрытая подготовка с объяснением */}
              {hidden.length > 0 && (
                <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    <p className="text-[13px] font-bold">{lt("estimateHidden")}</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{lt("clientHiddenExplain")}</p>
                  <div className="mt-2.5 space-y-1">{hidden.map(lineRow)}</div>
                </div>
              )}

              <Separator className="my-3" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">
                  {lang === "uk" ? "Разом із коефіцієнтом" : "Итого с коэффициентом"}
                </span>
                <span className="num text-base font-extrabold">{money(est?.total ?? brief.total)}</span>
              </div>
            </>
          ) : (
            // деградация: строки недоступны — показываем суммы из брифа
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{lt("estimateVisible")}</span>
                <b className="num">{money(brief.visible)}</b>
              </div>
              <div className="flex justify-between text-sm">
                <span>{lt("estimateHidden")}</span>
                <b className="num">{money(brief.hidden)}</b>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between">
                <span className="font-bold">{lt("total")}</span>
                <b className="num">{money(brief.total)}</b>
              </div>
            </div>
          )}

          {/* согласование */}
          {status === "sent" && (
            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-ok/30 bg-ok-soft p-3.5 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-[13px] leading-relaxed">
                {lang === "uk"
                  ? "Перевірте склад робіт. Якщо все правильно — погодьте, і майстер приступить до графіка."
                  : "Проверьте состав работ. Если всё верно — согласуйте, и мастер приступит к графику."}
              </p>
              <Button disabled={approve.isPending} onClick={() => approve.mutate()} className="shrink-0">
                <ThumbsUp className="size-4" />
                {approve.isPending ? lt("loading") : lt("estimateApprove")}
              </Button>
            </div>
          )}
          {status === "approved" && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-ok-soft px-3.5 py-2.5 text-[13px] font-medium text-ok">
              <Check className="size-4 shrink-0" /> {lt("estimateApproved")} —{" "}
              {lang === "uk" ? "дякуємо!" : "спасибо!"}
            </div>
          )}

          {/* вопросы и ответы */}
          <div className="mt-4 space-y-2">
            <p className="flex items-center gap-1.5 text-[13px] font-bold">
              <MessageSquare className="size-4 text-primary" /> {lt("estimateComments")}
            </p>
            {comments.isLoading ? (
              <ListSkeleton rows={2} height="h-8" />
            ) : (comments.data?.items ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {lang === "uk"
                  ? "Запитайте про будь-який рядок — майстер відповість прямо тут."
                  : "Спросите про любую строку — мастер ответит прямо здесь."}
              </p>
            ) : (
              (comments.data?.items ?? []).map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                    c.author === "master" ? "ml-auto bg-muted" : "bg-primary/15",
                  )}
                >
                  <p>{c.text}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {c.author === "master" ? (lang === "uk" ? "Майстер" : "Мастер") : lang === "uk" ? "Ви" : "Вы"} ·{" "}
                    {dateTime(c.createdAt, lang)}
                  </p>
                </div>
              ))
            )}
            <div className="flex gap-2">
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && comment.trim()) addComment.mutate();
                }}
                placeholder={lt("estimateCommentPlaceholder")}
                aria-label={lt("clientAskMaster")}
              />
              <Button
                size="icon"
                disabled={!comment.trim() || addComment.isPending}
                onClick={() => addComment.mutate()}
                aria-label={lt("clientAskMaster")}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- Экран кабинета ---------- */

export function ClientCabinetView({ token }: { token: string }) {
  const [tabOverride, setTabOverride] = React.useState<string | null>(null);
  const [viewPhotoId, setViewPhotoId] = React.useState<number | null>(null);
  const [shareUrl, setShareUrl] = React.useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["client", token],
    queryFn: () => api.client(token),
  });

  React.useEffect(() => {
    setShareUrl(window.location.href);
  }, []);

  // прямая ссылка на акт: плавно проскроллить к нему один раз, когда отрендерится
  const didFocusScroll = React.useRef(false);
  const focusActRef = React.useCallback((el: HTMLElement | null) => {
    if (!el || didFocusScroll.current) return;
    didFocusScroll.current = true;
    window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }, []);

  if (isLoading)
    return (
      <div className="bg-glow flex min-h-dvh flex-col bg-background">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-6">
          <div className="flex items-center gap-3">
            <BrandMark size={38} />
            <BrandWordmark />
          </div>
          <ListSkeleton rows={4} height="h-28" />
        </div>
        <DemoFooter />
      </div>
    );

  if (error || !data)
    return (
      <div className="bg-glow flex min-h-dvh flex-col bg-background">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-6">
          <div className="flex items-center gap-3">
            <BrandMark size={38} />
            <BrandWordmark />
          </div>
          {error instanceof ApiError && error.status === 404 ? (
            <Empty
              title="Ссылка недействительна"
              sub="Попросите у мастера свежую ссылку — старые он перевыпускает одной кнопкой."
            />
          ) : (
            <ErrorCard message={error?.message ?? "Кабинет не загрузился"} onRetry={() => refetch()} />
          )}
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => navigate("#/")}>
              <ArrowLeft className="size-4" /> В кабинет мастера
            </Button>
          </div>
        </div>
        <DemoFooter />
      </div>
    );

  const { object: o, focus, stages, estimates, acts, photos, payments } = data;
  const lang: Lang = o.locale === "uk" ? "uk" : "ru";
  const lt = ltFor(lang);
  const currentStage = stages.find((s) => s.status === "current");
  const nextStage = stages.find((s) => s.status === "next");
  const outstanding = Math.max(0, payments.total - payments.paid);
  const paidRatio = payments.total > 0 ? payments.paid / payments.total : 0;
  const viewPhoto = viewPhotoId == null ? null : (photos.find((p) => p.id === viewPhotoId) ?? null);
  const focusedEstimateId = focus?.kind === "estimate" ? focus.id : null;
  const focusedActId = focus?.kind === "act" ? focus.id : null;

  // таб по умолчанию — из focus прямой ссылки (смета/акт), иначе этапы;
  // после клика пользователя выбор закрепляется
  const tab = tabOverride ?? (focus?.kind === "estimate" ? "estimate" : focus?.kind === "act" ? "acts" : "stages");

  return (
    <div className="bg-glow flex min-h-dvh flex-col bg-background">
      {/* Шапка кабинета */}
      <header className="glass sticky top-0 z-40 border-b border-border/70 px-4 py-2.5">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5">
          <BrandMark size={30} />
          <div className="min-w-0 flex-1 leading-tight">
            <BrandWordmark compact />
            <p className="truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {o.companyName || o.masterName || (lang === "uk" ? "мій об'єкт" : "мой объект")}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="no-print size-8"
            aria-label={lang === "uk" ? "Друк" : "Печать"}
            onClick={() => window.print()}
          >
            <Printer className="size-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 pb-10 pt-5">
        {/* Заголовок объекта */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {o.masterName && (
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{o.masterName}</p>
            )}
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{o.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
              {o.address && <span>{o.address}</span>}
              {o.deadline && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3" />
                  {deadlineText(o.deadline, lang, o.status === "done")}
                </span>
              )}
            </p>
          </div>
          {o.status === "done" && (
            <Badge variant="outline" className="border-ok/30 bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">
              <Check className="size-3.5" /> {lang === "uk" ? "Об'єкт зданий" : "Объект сдан"}
            </Badge>
          )}
        </div>

        {/* Прогресс + расчёты */}
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
          <Card className="overflow-hidden border-primary/25">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <ProgressRing value={o.progress} size={104} sub="готово" />
              <div className="min-w-0 flex-1 space-y-1.5 leading-tight">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {lang === "uk" ? "Зараз виконується" : "Сейчас выполняется"}
                </p>
                <p className="text-lg font-bold">
                  {currentStage?.title ??
                    (o.status === "done" ? (lang === "uk" ? "Роботи завершено" : "Работы завершены") : "—")}
                </p>
                {currentStage?.note && <p className="text-[13px] text-muted-foreground">{currentStage.note}</p>}
                {nextStage && (
                  <p className="text-xs text-muted-foreground">
                    {lang === "uk" ? "Далі" : "Дальше"}: {nextStage.title}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {lt("clientBalance")}
                </p>
                {outstanding > 0.01 ? (
                  <span className="num text-[13px] font-bold text-warn">
                    {lt("clientToPay")}: {money(outstanding)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ok">
                    <Check className="size-3.5" />
                    {lang === "uk" ? "розрахунки в порядку" : "расчёты в порядке"}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="num text-2xl font-extrabold">{money(payments.paid)}</span>
                <span className="text-xs text-muted-foreground">
                  {lt("clientPaid")} / {money(payments.total)}
                </span>
              </div>
              <div className="w-full">
                <MoneyBar value={paidRatio} tone={outstanding > 0.01 ? "warn" : "ok"} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {lang === "uk" ? "Виконано за актами" : "Выполнено по актам"}: {money(payments.total)} · {acts.length}{" "}
                {plural(acts.length, lang, ["акт", "акта", "актов"], ["акт", "акти", "актів"])}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Персональная ссылка */}
        <div className="no-print flex flex-wrap items-center gap-2.5 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3.5 py-2.5">
          <Link2 className="size-4 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
            {lang === "uk"
              ? "Це ваша персональна посилання на кабінет — збережіть її, щоб повертатися до прогресу без запитів майстру."
              : "Это ваша персональная ссылка на кабинет — сохраните её, чтобы возвращаться к прогрессу без вопросов мастеру."}
          </p>
          <CopyButton text={shareUrl} label={lt("objectCopyLink")} />
        </div>

        {/* Разделы */}
        <Tabs value={tab} onValueChange={setTabOverride}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="stages" className="truncate px-1 text-xs sm:text-[13px]">
              {lt("clientStages")}
            </TabsTrigger>
            <TabsTrigger value="estimate" className="truncate px-1 text-xs sm:text-[13px]">
              {lt("clientEstimate")}
            </TabsTrigger>
            <TabsTrigger value="acts" className="truncate px-1 text-xs sm:text-[13px]">
              {lt("actsTitle")}
            </TabsTrigger>
            <TabsTrigger value="photos" className="truncate px-1 text-xs sm:text-[13px]">
              {lt("clientPhotos")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stages" className="mt-3 space-y-3">
            {stages.length === 0 ? (
              <Empty
                className="py-6"
                title={lt("clientStages")}
                sub={lang === "uk" ? "Майстер ще не додав етапи" : "Мастер ещё не добавил этапы"}
              />
            ) : (
              stages.map((s) => <ClientStageCard key={s.id} s={s} lt={lt} lang={lang} onOpenPhoto={setViewPhotoId} />)
            )}
          </TabsContent>

          <TabsContent value="estimate" className="mt-3 space-y-3">
            {estimates.length === 0 ? (
              <Empty
                className="py-6"
                title={lt("clientEstimate")}
                sub={
                  lang === "uk" ? "Майстер надішле кошторис — він з'явиться тут" : "Мастер пришлёт смету — она появится здесь"
                }
              />
            ) : (
              estimates.map((est, i) => (
                <ClientEstimateCard
                  key={est.id}
                  brief={est}
                  token={token}
                  lt={lt}
                  lang={lang}
                  defaultOpen={i === 0}
                  focused={focusedEstimateId === est.id}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="acts" className="mt-3 space-y-3">
            {acts.length > 0 && (
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                {lt("clientActs")}
              </h2>
            )}
            {acts.length === 0 ? (
              <Empty
                className="py-6"
                title={lt("clientActs")}
                sub={
                  lang === "uk"
                    ? "Акти з'являються в міру виконання робіт"
                    : "Акты появляются по мере выполнения работ"
                }
              />
            ) : (
              acts.map((a) => (
                <ClientActCard
                  key={a.id}
                  act={a}
                  photos={photos}
                  lt={lt}
                  lang={lang}
                  onOpenPhoto={setViewPhotoId}
                  focusRef={focusedActId === a.id ? focusActRef : undefined}
                  focused={focusedActId === a.id}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="photos" className="mt-3">
            {photos.length === 0 ? (
              <Empty
                className="py-6"
                icon={Camera}
                title={lang === "uk" ? "Фото поки немає" : "Фото пока нет"}
                sub={
                  lang === "uk"
                    ? "Майстер публікуватиме фотоетапи в міру готовності"
                    : "Мастер будет публиковать фотоэтапы по мере готовности"
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((p) => (
                  <PhotoTile key={p.id} p={p} lt={lt} lang={lang} onOpen={() => setViewPhotoId(p.id)} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Просмотр фото */}
      <Dialog
        open={!!viewPhoto}
        onOpenChange={(v) => {
          if (!v) setViewPhotoId(null);
        }}
      >
        {viewPhoto && (
          <DialogContent className="scroll-thin max-h-[92dvh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-left">
                {viewPhoto.caption || kindLabel(viewPhoto.kind, lt)}
              </DialogTitle>
              <DialogDescription className="text-left">
                {dateFull(viewPhoto.takenAt ?? viewPhoto.createdAt, lang)}
                {viewPhoto.actNo > 0 && ` · ${lt("actNumber")} ${viewPhoto.actNo}`}
              </DialogDescription>
            </DialogHeader>
            <img
              src={viewPhoto.fileUrl}
              alt={viewPhoto.caption || kindLabel(viewPhoto.kind, lt)}
              className="max-h-[60dvh] w-full rounded-xl border bg-muted object-contain"
            />
          </DialogContent>
        )}
      </Dialog>

      <DemoFooter />
    </div>
  );
}
