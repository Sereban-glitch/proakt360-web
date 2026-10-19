"use client";

// Акт выполненных работ: позиции по разделам (стены/потолки/доп/подготовка),
// оплаты (добавить/удалить ошибочную), фото, удаление акта.
// Экспорт: текст для Telegram (копируется в буфер), XLSX и печать/PDF —
// в печать уходит документ: заголовок, период, строки по разделам, сумма.

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type ActLineDTO } from "@/lib/api";
import { useI18n, type Lang } from "@/lib/i18n";
import { dateFull, dateTime, money, moneyShort, plural } from "@/lib/format";
import { navigate } from "@/lib/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
  CopyButton,
  Empty,
  ErrorCard,
  ListSkeleton,
  PhotoThumb,
  ProgressRing,
  SectionHead,
  StatusBadge,
} from "@/components/kit";
import { ChevronDown, ClipboardList, FileSpreadsheet, Plus, Printer, Send, Trash2, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Разделы и локальный формат ---------- */

const MONTHS_UK = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];

function dateFullLoc(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (lang === "uk") return `${d.getDate()} ${MONTHS_UK[d.getMonth()]} ${d.getFullYear()}`;
  return dateFull(iso);
}

/** «2026-09-17…» → «17.09» */
function periodShort(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}` : iso.slice(0, 10);
}

/** Заголовки разделов — как мастер шлёт заказчику в Telegram. */
function sectionTitle(sec: string, lang: Lang): string {
  const uk = lang === "uk";
  switch (sec) {
    case "стены":
      return uk ? "Малярні роботи на стінах" : "Малярные работы на стенах";
    case "потолки":
      return uk ? "Малярні роботи на стелях" : "Малярные работы на потолках";
    case "доп":
      return uk ? "Додаткові роботи" : "Дополнительные работы";
    case "подготовка":
      return uk ? "Підготовчі роботи" : "Подготовительные работы";
    default:
      return sec;
  }
}

function groupBySection(lines: ActLineDTO[]): { section: string; items: ActLineDTO[] }[] {
  const order: string[] = [];
  const map = new Map<string, ActLineDTO[]>();
  for (const l of lines) {
    const sec = (l.section || "").trim();
    if (!map.has(sec)) {
      map.set(sec, []);
      order.push(sec);
    }
    map.get(sec)!.push(l);
  }
  return order.map((section) => ({ section, items: map.get(section)! }));
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

/** Печать: скрыть каркас приложения (шапку/табы/демо-футер) — только для этого экрана. */
const PRINT_CSS = `
@media print {
  body[data-print-act] header.glass,
  body[data-print-act] nav[aria-label="Нижняя навигация"],
  body[data-print-act] footer { display: none !important; }
  body[data-print-act] main { padding: 0 !important; }
}
`;

/* ---------- Экран акта ---------- */

export function ActDetailView({ id }: { id: number }) {
  const qc = useQueryClient();
  const { t, lang } = useI18n();
  const [amount, setAmount] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [tgText, setTgText] = React.useState<string | null>(null);
  const [tgLoading, setTgLoading] = React.useState(false);
  const [showText, setShowText] = React.useState(false);

  React.useEffect(() => {
    document.body.setAttribute("data-print-act", "1");
    return () => document.body.removeAttribute("data-print-act");
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["act", id],
    queryFn: () => api.act(id),
  });

  const addPayment = useMutation({
    mutationFn: () => api.addPayment(id, parseFloat(amount.replace(",", ".")) || 0),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["act", id] });
      qc.invalidateQueries({ queryKey: ["acts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["objects"] });
      setAmount("");
      toast.success(lang === "uk" ? "Оплату відзначено" : "Оплата отмечена", {
        description: `${lang === "uk" ? "Залишок" : "Остаток"}: ${money(r.act.total - r.act.paid)}`,
      });
    },
    onError: (e) => toast.error(lang === "uk" ? "Оплата не відзначилася" : "Не отметилась оплата", { description: e.message }),
  });

  const deletePayment = useMutation({
    mutationFn: (payId: number) => api.deletePayment(payId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["act", id] });
      qc.invalidateQueries({ queryKey: ["acts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(lang === "uk" ? "Оплату видалено" : "Оплата удалена");
    },
  });

  const deleteAct = useMutation({
    mutationFn: () => api.deleteAct(id),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(lang === "uk" ? "Акт видалено" : "Акт удалён", {
        description:
          lang === "uk" ? "Позиції та оплати пішли разом із ним" : "Позиции и оплаты ушли вместе с ним",
      });
      navigate("#/acts");
    },
  });

  const copyTelegram = async () => {
    setTgLoading(true);
    try {
      const res = await fetch(api.exportActTextURL(id, lang));
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const text = await res.text();
      setTgText(text);
      setShowText(true);
      const okCopy = await copyToClipboard(text);
      if (okCopy) {
        toast.success(lang === "uk" ? "Скопійовано — вставте в чат" : "Скопировано — вставьте в чат", {
          description:
            lang === "uk"
              ? `Акт №${data?.act.actNo ?? ""} · ${linesCount()} ${plural(linesCount(), "позиція", "позиції", "позицій")}`
              : `Акт №${data?.act.actNo ?? ""} · ${linesCount()} ${plural(linesCount(), "позиция", "позиции", "позиций")}`,
        });
      } else {
        toast.error(lang === "uk" ? "Не вдалося скопіювати" : "Не удалось скопировать", {
          description: lang === "uk" ? "Текст нижче — виділіть і скопіюйте вручну" : "Текст ниже — выделите и скопируйте вручную",
        });
      }
    } catch (e) {
      toast.error(lang === "uk" ? "Не вдалося отримати текст" : "Не удалось получить текст", {
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setTgLoading(false);
    }
  };

  const linesCount = () => data?.lines.length ?? 0;

  if (isLoading) return <ListSkeleton rows={4} height="h-28" />;
  if (error || !data)
    return (
      <div className="space-y-4 fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate("#/acts")}>
          ← {lang === "uk" ? "До актів" : "К актам"}
        </Button>
        <ErrorCard message={error?.message ?? (lang === "uk" ? "Акт не знайдено" : "Акт не найден")} onRetry={() => refetch()} />
      </div>
    );

  const { act, lines, payments, photos } = data;
  const balance = act.total - act.paid;
  const period =
    act.periodFrom || act.periodTo
      ? `${act.periodFrom ? periodShort(act.periodFrom) : "…"} — ${act.periodTo ? periodShort(act.periodTo) : "…"}`
      : "";
  const groups = groupBySection(lines);
  const posWord = (n: number) =>
    lang === "uk" ? plural(n, "позиція", "позиції", "позицій") : plural(n, "позиция", "позиции", "позиций");
  const payWord = (n: number) =>
    lang === "uk" ? plural(n, "оплата", "оплати", "оплат") : plural(n, "оплата", "оплаты", "оплат");

  return (
    <div className="space-y-4 fade-in">
      <style>{PRINT_CSS}</style>

      {/* Печатная шапка документа */}
      <div className="hidden print:block space-y-0.5 pb-4">
        <p className="text-lg font-extrabold uppercase tracking-wide">
          {lang === "uk" ? `Акт виконаних робіт №${act.actNo}` : `Акт выполненных работ №${act.actNo}`}
        </p>
        <p className="text-sm">
          {act.objectName} · {act.customer}
        </p>
        <p className="text-sm">
          {dateFullLoc(act.date, lang)}
          {period && ` · ${t("actPeriod")}: ${period}`}
        </p>
      </div>

      {/* Экранный заголовок */}
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">
            {t("actNumber")}
            {act.actNo}
          </h1>
          <button
            type="button"
            className="mt-0.5 text-[13px] text-muted-foreground hover:text-foreground"
            onClick={() => navigate(`#/objects/${act.objectId}`)}
          >
            {act.objectName} · {dateFullLoc(act.date, lang)}
          </button>
          {period && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("actPeriod")}: <span className="num font-semibold text-foreground">{period}</span>
            </p>
          )}
        </div>
        <StatusBadge kind="act" value={act.status} />
      </div>

      {/* Деньги */}
      <Card className={cn("no-print", balance > 0.01 ? "border-danger/30" : "border-ok/30")}>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <ProgressRing
            value={act.total > 0 ? (act.paid / act.total) * 100 : 100}
            size={88}
            sub={lang === "uk" ? "оплачено" : "оплачено"}
            className={balance > 0.01 ? "" : "[&_circle:nth-child(3)]:stroke-ok"}
          />
          <div className="min-w-0 flex-1 space-y-1 leading-tight">
            <p className="num text-2xl font-extrabold">{money(act.total)}</p>
            <p className="text-[13px] text-muted-foreground">
              {t("actPaid").toLowerCase()} <b className="num text-foreground">{money(act.paid)}</b>
              {balance > 0.01 ? (
                <>
                  {" · "}
                  {t("actDebt").toLowerCase()} <b className="num text-danger">{money(balance)}</b>
                </>
              ) : (
                <>
                  {" · "}
                  <span className="text-ok">{lang === "uk" ? "закрито повністю" : "закрыт полностью"}</span>
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {lines.length} {posWord(lines.length)} · {payments.length} {payWord(payments.length)}
            </p>
          </div>
          <div className="w-full shrink-0 sm:w-44">
            <div className="flex gap-2">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder={lang === "uk" ? "сума, грн" : "сумма, грн"}
                aria-label={lang === "uk" ? "Сума оплати" : "Сумма оплаты"}
              />
              <Button
                size="icon"
                aria-label={lang === "uk" ? "Відзначити оплату" : "Отметить оплату"}
                disabled={!amount || addPayment.isPending}
                onClick={() => addPayment.mutate()}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            {balance > 0.01 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => setAmount(String(balance))}
              >
                <Wallet className="size-3.5" /> {lang === "uk" ? "Все" : "Всё"} — {moneyShort(balance)}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Экспорт */}
      <Card className="no-print">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <Button size="sm" className="font-semibold" onClick={() => void copyTelegram()} disabled={tgLoading}>
            {tgLoading ? <ButtonSpinner /> : <Send className="size-4" />} {t("actCopyText")}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={api.exportActXlsxURL(id)} download>
              <FileSpreadsheet className="size-4" /> {t("actDownloadXlsx")}
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> {t("actPrint")}
          </Button>
        </CardContent>
      </Card>

      {/* Превью текста для Telegram */}
      {tgText !== null && (
        <Card className="no-print">
          <CardContent className="space-y-2.5 p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
              onClick={() => setShowText((v) => !v)}
              aria-expanded={showText}
            >
              <span className="text-sm font-bold">{t("actCopyText")}</span>
              <ChevronDown
                className={cn("size-4 shrink-0 text-muted-foreground transition-transform", showText && "rotate-180")}
              />
            </button>
            {showText && (
              <>
                <pre className="max-h-96 overflow-y-auto scroll-thin whitespace-pre-wrap rounded-xl bg-muted p-3 font-sans text-xs leading-relaxed">
                  {tgText}
                </pre>
                <CopyButton text={tgText} label={t("copy")} size="sm" />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Позиции по разделам */}
      <Card className="print:border-0 print:shadow-none">
        <CardContent className="p-0">
          <div className="px-4 pb-1 pt-4">
            <SectionHead title={t("actLines")} />
          </div>
          {lines.length === 0 ? (
            <Empty
              className="m-4 border-0 py-4"
              icon={ClipboardList}
              title={lang === "uk" ? "Позицій немає" : "Позиций нет"}
            />
          ) : (
            <div>
              {groups.map((g, gi) => (
                <div key={g.section || `group-${gi}`}>
                  {g.section && (
                    <p className="bg-muted/40 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground print:bg-transparent">
                      {sectionTitle(g.section, lang)}
                    </p>
                  )}
                  <div className="divide-y divide-border/70 print:divide-border">
                    {g.items.map((l) => (
                      <div key={l.id} className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 text-sm">
                        <span className="num w-4 sm:w-5 shrink-0 text-[10px] text-muted-foreground">{l.pos}.</span>
                        <span className="min-w-0 flex-1 truncate font-medium text-xs sm:text-sm">{l.name}</span>
                        <span className="num shrink-0 text-[11px] sm:text-xs text-muted-foreground">
                          {l.qty.toString().replace(".", ",")} {l.unit}
                        </span>
                        <span className="num shrink-0 text-[11px] sm:text-xs text-muted-foreground">× {moneyShort(l.price, lang)}</span>
                        <span className="num w-20 sm:w-24 shrink-0 text-right font-bold text-xs sm:text-sm">{money(l.sum)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-bold">
              {lang === "uk" ? "Загальна сума" : "Общая сумма"}
            </span>
            <span className="num text-base font-extrabold">{money(act.total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Оплаты */}
      <Card className="no-print">
        <CardContent className="p-0">
          <div className="px-4 pb-1 pt-4">
            <SectionHead title={`${t("actPayments")} (${payments.length})`} />
          </div>
          {payments.length === 0 ? (
            <p className="px-4 pb-4 pt-1 text-xs text-muted-foreground">
              {lang === "uk"
                ? "Оплат поки немає — відзначте суму вище, залишок по акту перерахується одразу."
                : "Оплат пока нет — отметьте сумму выше, остаток по акту пересчитается сразу."}
            </p>
          ) : (
            <div className="divide-y divide-border/70">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Wallet className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="num text-sm font-bold">{money(p.amount)}</p>
                    <p className="text-[11px] text-muted-foreground">{dateTime(p.at)}</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        aria-label={lang === "uk" ? "Видалити оплату" : "Удалить оплату"}
                        className="rounded-lg p-1.5 text-muted-foreground/50 hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {lang === "uk" ? "Видалити оплату" : "Удалить оплату"} {money(p.amount)}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {lang === "uk"
                            ? "Хибна сума зникне, борг по акту стане правдивим."
                            : "Ошибочная сумма уйдёт, долг по акту вернётся к правде."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-white hover:bg-destructive/90"
                          onClick={() => deletePayment.mutate(p.id)}
                        >
                          {t("delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Фото акта */}
      {photos.length > 0 && (
        <section className="no-print space-y-2.5">
          <SectionHead title={`${t("photosTitle")} (${photos.length})`} />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <PhotoThumb key={p.id} id={p.id} caption={p.caption} date={dateTime(p.createdAt)} />
            ))}
          </div>
        </section>
      )}

      {/* Удаление акта */}
      <div className="no-print flex justify-end">
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
              <Trash2 className="size-4" /> {lang === "uk" ? "Видалити акт" : "Удалить акт"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {lang === "uk" ? "Видалити акт" : "Удалить акт"} №{act.actNo}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {lang === "uk"
                  ? `Зникнуть ${lines.length} ${posWord(lines.length)} і ${payments.length} ${payWord(payments.length)}. Фото залишаться в об'єкта.`
                  : `Уйдут ${lines.length} ${posWord(lines.length)} и ${payments.length} ${payWord(payments.length)}. Фото останутся у объекта.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => deleteAct.mutate()}>
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
