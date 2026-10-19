"use client";

// Конструктор смет — сердце «ПрорАКТ 360». Быстро: строкой «шпаклёвка 45 180»,
// подсказки из прайса одним тапом, шаблоны техциклов, помещения с нормами,
// коэффициент сложности, скрытые работы. Строки живут в разделах
// (стены/потолки/доп/подготовка), а еженедельный акт собирается из остатков
// строк: отметьте выполненное и объём — акт создастся сам.

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type EstimateLineDTO, type RoomPresetDTO, type TemplateDTO } from "@/lib/api";
import { useI18n, type Lang } from "@/lib/i18n";
import { dateTime, money, moneyShort, plural, qty as fmtQty } from "@/lib/format";
import { navigate } from "@/lib/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ButtonSpinner, Empty, ErrorCard, HiddenBadge, ListSkeleton, MoneyBar, StatusBadge } from "@/components/kit";
import {
  CalendarDays,
  Check,
  ClipboardList,
  Download,
  Ghost,
  Layers,
  MessageSquare,
  Minus,
  Plus,
  Send,
  Sparkles,
  SquarePen,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Разделы строк ---------- */

const SECTIONS = ["стены", "потолки", "доп", "подготовка"] as const;
const SECTION_NONE = "none"; // Radix Select не принимает value=""

function sectionLabel(sec: string, lang: Lang): string {
  if (lang === "uk") {
    switch (sec) {
      case "стены":
        return "стіни";
      case "потолки":
        return "стелі";
      case "доп":
        return "дод";
      case "подготовка":
        return "підготовка";
    }
  }
  return sec; // в БД разделы хранятся по-русски
}

function sectionItemsFor(sec: string): string[] {
  return (SECTIONS as readonly string[]).includes(sec) ? [...SECTIONS] : [sec, ...SECTIONS];
}

/* ---------- Мелкие утилиты ---------- */

function useDesktop(): boolean {
  const [isDesktop, setDesktop] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches,
  );
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const upd = () => setDesktop(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);
  return isDesktop;
}

function parseNum(s: string): number {
  const v = parseFloat(s.trim().replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- Быстрый ввод позиции ---------- */

function QuickAdd({ estimateId }: { estimateId: number }) {
  const qc = useQueryClient();
  const { t, lang } = useI18n();
  const [text, setText] = React.useState("");
  const [section, setSection] = React.useState<string>("стены");
  const [debounced, setDebounced] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim().toLowerCase()), 220);
    return () => clearTimeout(t);
  }, [text]);

  const suggest = useQuery({
    queryKey: ["suggest", debounced],
    queryFn: () => api.suggest(debounced),
    enabled: focused && debounced.length >= 2,
  });

  const add = useMutation({
    mutationFn: (lines: Partial<EstimateLineDTO>[]) => api.addLines(estimateId, lines),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setText("");
      inputRef.current?.focus();
      if (r.added === 1) toast.success(lang === "uk" ? "Позицію додано" : "Позиция добавлена");
      else toast.success(lang === "uk" ? `Додано позицій: ${r.added}` : `Добавлено позиций: ${r.added}`);
    },
    onError: (e) => toast.error(lang === "uk" ? "Не додалося" : "Не добавилось", { description: e.message }),
  });

  const submit = async () => {
    const raw = text.trim();
    if (!raw) return;
    try {
      const r = await api.parseLine(raw);
      if (r.suspicious || r.lines.length === 0) {
        toast.warning(
          lang === "uk" ? "Схоже, в одному рядку кілька позицій" : "Похоже, в одной строке несколько позиций",
          {
            description:
              lang === "uk"
                ? "Введіть кожну окремо: «шліфовка 45 м 50», потім «грунтовка 45»"
                : "Введите каждую отдельно: «шлифовка 45 м 50», затем «грунтовка 45»",
          },
        );
        return;
      }
      add.mutate(r.lines.map((l) => ({ name: l.name, qty: l.qty || 1, unit: l.unit, price: l.price, hidden: false, section })));
    } catch (e) {
      toast.error(lang === "uk" ? "Не розпізнався" : "Не распозналось", {
        description: e instanceof Error ? e.message : "",
      });
    }
  };

  const items = suggest.data?.items ?? [];
  const showSuggest = focused && items.length > 0 && debounced.length >= 2;

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 180)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
              if (e.key === "Escape") setFocused(false);
            }}
            placeholder={
              lang === "uk" ? "штукатурка 45 м² 260 — і позиція в кошторисі" : "штукатурка 45 м² 260 — и позиция в смете"
            }
            aria-label={lang === "uk" ? "Швидке введення позиції" : "Быстрый ввод позиции"}
          />
          {showSuggest && (
            <div className="glass absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
              <p className="border-b border-border/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {lang === "uk" ? "з прайсу — тапом" : "из прайса — тапом"}
              </p>
              <div className="max-h-56 overflow-y-auto scroll-thin">
                {items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add.mutate([{ name: it.name, qty: 1, unit: it.unit, price: it.price, hidden: false, section }]);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {it.name}
                      {it.unit && <span className="text-muted-foreground"> · {it.unit}</span>}
                    </span>
                    <span className="num shrink-0 text-[13px] font-semibold">{moneyShort(it.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button onClick={() => void submit()} disabled={!text.trim() || add.isPending}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">{t("estimateAdd")}</span>
        </Button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Select value={section} onValueChange={setSection}>
          <SelectTrigger size="sm" className="h-7 w-[120px] rounded-lg text-xs" aria-label={t("lineSection")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {sectionLabel(s, lang)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
          {lang === "uk"
            ? "«шліфовка 45м 50» теж спрацює · без ціни — підставиться прайс · декілька позицій — через кому"
            : "«шлифовка 45м 50» тоже сработает · без цены — подставится прайс · несколько позиций — через запятую"}
        </p>
      </div>
    </div>
  );
}

/* ---------- Строка сметы ---------- */

function LineRow({ estimateId, line }: { estimateId: number; line: EstimateLineDTO }) {
  const qc = useQueryClient();
  const { t, lang } = useI18n();
  const [price, setPrice] = React.useState(String(line.price));
  const [qtyVal, setQtyVal] = React.useState(String(line.qty));
  const [section, setSection] = React.useState(line.section);
  React.useEffect(() => setPrice(String(line.price)), [line.price]);
  React.useEffect(() => setQtyVal(String(line.qty)), [line.qty]);
  React.useEffect(() => setSection(line.section), [line.section]);

  const patch = useMutation({
    mutationFn: (patch: Partial<EstimateLineDTO>) => api.patchLine(estimateId, line.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
    },
    onError: (e, variables) => {
      if ("section" in variables && variables.section !== undefined) setSection(line.section);
      toast.error(lang === "uk" ? "Не збереглося" : "Не сохранилось", {
        description:
          e.message === "Нет полей для обновления"
            ? lang === "uk"
              ? "Поле section ще не приймається API — розділ рядка тимчасово не зберігається на сервері"
              : "Поле section пока не принимается API — раздел строки временно не сохраняется на сервере"
            : e.message,
      });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteLine(estimateId, line.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
      toast.success(lang === "uk" ? "Позицію видалено" : "Позиция удалена");
    },
  });

  const stepQty = (delta: number) => {
    const current = parseNum(qtyVal) || 1;
    const v = Math.max(0.1, current + delta);
    setQtyVal(String(Math.round(v * 100) / 100));
    patch.mutate({ qty: Math.round(v * 100) / 100 });
  };

  const commitPrice = () => {
    const v = parseNum(price);
    if (!Number.isNaN(v) && v !== line.price) patch.mutate({ price: v });
    else setPrice(String(line.price));
  };

  const commitQty = () => {
    const v = parseNum(qtyVal);
    if (!Number.isNaN(v) && v !== line.qty) patch.mutate({ qty: v });
    else setQtyVal(String(line.qty));
  };

  const changeSection = (v: string) => {
    const next = v === SECTION_NONE ? "" : v;
    setSection(next);
    patch.mutate({ section: next });
  };

  // выполнение: сколько из строки уже ушло в акты
  const fullyActed = line.qty > 0 && line.remainingQty <= 0.001;
  const partial = line.doneQty > 0.001 && !fullyActed;
  const doneRatio = line.qty > 0 ? Math.min(1, line.doneQty / line.qty) : 0;

  return (
    <div
      className={cn(
        "group rounded-xl border bg-card p-2.5 transition-colors",
        line.hidden && "border-dashed",
        fullyActed ? "border-border/70 opacity-55" : "border-border/70",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="num text-[10px] text-muted-foreground">{line.pos}.</span>
            <p className={cn("min-w-0 flex-1 truncate text-sm font-semibold", fullyActed && "line-through")}>
              {line.name}
            </p>
            {line.section && (
              <span
                className="inline-flex shrink-0 items-center rounded-full border border-border/60 bg-muted/60 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                title={t("lineSection")}
              >
                {sectionLabel(line.section, lang)}
              </span>
            )}
            {line.hidden && <HiddenBadge />}
            {fullyActed && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ok-soft px-1.5 py-0 text-[10px] font-semibold text-ok">
                <Check className="size-3" /> {lang === "uk" ? "у актах" : "в актах"}
              </span>
            )}
          </div>
          {line.note && <p className="truncate text-[11px] text-muted-foreground">{line.note}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => patch.mutate({ hidden: !line.hidden })}
            title={
              line.hidden
                ? lang === "uk"
                  ? "Прибрати «прихована робота»"
                  : "Убрать «скрытая работа»"
                : lang === "uk"
                  ? "Позначити як приховану підготовку"
                  : "Пометить как скрытую подготовку"
            }
            aria-label={lang === "uk" ? "Прихована робота" : "Скрытая работа"}
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              line.hidden
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground/50 hover:bg-muted hover:text-foreground",
            )}
          >
            <Ghost className="size-3.5" />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                title={lang === "uk" ? "Видалити позицію" : "Удалить позицию"}
                aria-label={lang === "uk" ? "Видалити позицію" : "Удалить позицию"}
                className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {lang === "uk" ? "Видалити" : "Удалить"} «{line.name}»?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {lang === "uk" ? "Позиція зникне з кошторису. Акти не чіпаємо." : "Позиция уйдёт из сметы. Акты не трогаем."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => remove.mutate()}>
                  {t("delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            onClick={() => stepQty(-1)}
            className="pressable px-2 py-1 text-muted-foreground hover:bg-accent"
            aria-label={lang === "uk" ? "Менше" : "Меньше"}
          >
            <Minus className="size-3.5" />
          </button>
          <input
            value={qtyVal}
            onChange={(e) => setQtyVal(e.target.value)}
            onBlur={commitQty}
            onKeyDown={(e) => e.key === "Enter" && commitQty()}
            inputMode="decimal"
            aria-label={lang === "uk" ? "Кількість" : "Количество"}
            className="num w-14 border-x border-border bg-transparent px-1 py-1 text-center text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => stepQty(1)}
            className="pressable px-2 py-1 text-muted-foreground hover:bg-accent"
            aria-label={lang === "uk" ? "Більше" : "Больше"}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        {line.unit && <span className="w-10 text-xs text-muted-foreground">{line.unit}</span>}
        <span className="text-xs text-muted-foreground">×</span>
        <div className="flex items-center gap-1">
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => e.key === "Enter" && commitPrice()}
            inputMode="decimal"
            aria-label={lang === "uk" ? "Ціна" : "Цена"}
            className="num w-20 rounded-lg border border-border bg-transparent px-2 py-1 text-right text-sm outline-none focus:border-primary/60"
          />
          <span className="text-xs text-muted-foreground">{t("uah")}</span>
        </div>
        <span className="num ml-auto text-sm font-bold">= {moneyShort(line.sum)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Select value={section || SECTION_NONE} onValueChange={changeSection}>
          <SelectTrigger size="sm" className="h-7 w-[120px] rounded-lg text-xs" aria-label={t("lineSection")}>
            <SelectValue placeholder={t("lineSection")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SECTION_NONE}>{lang === "uk" ? "— без розділу —" : "— без раздела —"}</SelectItem>
            {sectionItemsFor(section).map((s) => (
              <SelectItem key={s} value={s}>
                {sectionLabel(s, lang)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {partial && (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="w-14 shrink-0 sm:w-20">
              <MoneyBar tone="primary" value={doneRatio} />
            </div>
            <span className="num truncate text-[10px] text-muted-foreground">
              {lang === "uk"
                ? `у актах ${fmtQty(line.doneQty)} з ${fmtQty(line.qty)} ${line.unit}`
                : `в актах ${fmtQty(line.doneQty)} из ${fmtQty(line.qty)} ${line.unit}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Шаблоны ---------- */

function TemplatesSheet({
  open,
  onOpenChange,
  estimateId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  estimateId: number;
}) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["templates"], queryFn: api.templates });
  const apply = useMutation({
    mutationFn: (tpl: TemplateDTO) => api.addLines(estimateId, tpl.lines.map((l) => ({ ...l }))),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
      onOpenChange(false);
      toast.success(
        lang === "uk" ? `Шаблон вставлено: +${r.added}` : `Шаблон вставлен: +${r.added}`,
        {
          description: `${r.added} ${
            lang === "uk"
              ? plural(r.added, "позиція", "позиції", "позицій")
              : plural(r.added, "позиция", "позиции", "позиций")
          }`,
        },
      );
    },
    onError: (e) => toast.error(lang === "uk" ? "Не вставився шаблон" : "Не вставился шаблон", { description: e.message }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto scroll-thin">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-left">
            <Layers className="size-5 text-primary" />{" "}
            {lang === "uk" ? "Вставити шаблон робіт" : "Вставить шаблон работ"}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-2 px-1">
          {isLoading && <ListSkeleton rows={3} height="h-20" />}
          {(data?.items ?? []).map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              disabled={apply.isPending}
              onClick={() => apply.mutate(tpl)}
              className="pressable w-full rounded-xl border border-border bg-card p-3.5 text-left hover:border-primary/40"
            >
              <p className="text-sm font-semibold">{tpl.name}</p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                {tpl.lines.map((l) => l.name).join(" → ")}
              </p>
              <p className="mt-1.5 text-[11px] font-semibold text-primary">
                +{tpl.lines.length}{" "}
                {lang === "uk"
                  ? plural(tpl.lines.length, "позиція", "позиції", "позицій")
                  : plural(tpl.lines.length, "позиция", "позиции", "позиций")}{" "}
                ·{" "}
                {lang === "uk"
                  ? "кількість = 1, обсяг підберіть степером"
                  : "количества = 1, объём подгоните степпером"}
              </p>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------- Помещение с нормами ---------- */

function RoomSheet({
  open,
  onOpenChange,
  estimateId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  estimateId: number;
}) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["room-presets"], queryFn: api.roomPresets });
  const [presetKey, setPresetKey] = React.useState("room");
  const [area, setArea] = React.useState("20");
  const [height, setHeight] = React.useState("2.7");
  const [perimeter, setPerimeter] = React.useState("");

  const presets = data?.items ?? [];
  const preset: RoomPresetDTO | undefined = presets.find((p) => p.key === presetKey);

  const areaN = parseNum(area) || 0;
  const heightN = parseNum(height) || 0;
  const perimN = parseNum(perimeter) || (areaN > 0 ? 4 * Math.sqrt(areaN) : 0);

  const preview = React.useMemo(() => {
    if (!preset) return [];
    return preset.base.map((b) => {
      const q = b.src === "S" ? areaN : b.src === "PH" ? perimN * heightN : b.src === "P" ? perimN : 1;
      return { ...b, qty: Math.round(q * 100) / 100, sum: Math.round(q * 100) / 100 * b.price };
    });
  }, [preset, areaN, heightN, perimN]);

  const total = preview.reduce((s, l) => s + l.sum, 0);

  const apply = useMutation({
    mutationFn: () => api.applyRoom(estimateId, presetKey, areaN, heightN, perimeter ? perimN : undefined),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
      onOpenChange(false);
      toast.success(
        lang === "uk" ? `Приміщення додано: +${r.added}` : `Помещение добавлено: +${r.added}`,
        {
          description: `${r.added} ${
            lang === "uk"
              ? plural(r.added, "позиція", "позиції", "позицій")
              : plural(r.added, "позиция", "позиции", "позиций")
          }`,
        },
      );
    },
    onError: (e) => toast.error(lang === "uk" ? "Не додалося" : "Не добавилось", { description: e.message }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto scroll-thin">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-left">
            <Sparkles className="size-5 text-primary" />{" "}
            {lang === "uk" ? "Типове приміщення з нормами" : "Типовое помещение с нормами"}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-1">
          <div className="grid grid-cols-3 gap-1.5">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPresetKey(p.key)}
                className={cn(
                  "pressable rounded-xl border px-2 py-2.5 text-center text-xs font-semibold transition-colors",
                  presetKey === p.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
          {preset && <p className="text-xs text-muted-foreground">{preset.hint}</p>}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">{lang === "uk" ? "Площа, м²" : "Площадь, м²"}</Label>
              <Input value={area} onChange={(e) => setArea(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">{lang === "uk" ? "Висота, м" : "Высота, м"}</Label>
              <Input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">{lang === "uk" ? "Периметр, м" : "Периметр, м"}</Label>
              <Input
                value={perimeter}
                onChange={(e) => setPerimeter(e.target.value)}
                inputMode="decimal"
                placeholder={areaN > 0 ? `≈ ${Math.round(perimN * 10) / 10}` : ""}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {lang === "uk"
              ? "Норми: стеля = S · стіни = периметр × висота · плінтус = периметр. Периметр за замовчуванням ≈ 4·√S."
              : "Нормы: потолок = S · стены = периметр × высота · плинтус = периметр. Периметр по умолчанию ≈ 4·√S."}
          </p>
          {preview.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border/70">
                  {preview.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 px-3.5 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {l.name}
                        {l.hidden && <HiddenBadge compact />}
                      </span>
                      <span className="num text-xs text-muted-foreground">
                        {fmtQty(l.qty)} {l.unit}
                      </span>
                      <span className="num w-20 text-right font-semibold">{moneyShort(l.sum)}</span>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <span className="text-sm font-bold">{lang === "uk" ? "Разом" : "Итого"}</span>
                  <span className="num text-sm font-extrabold">{money(total)}</span>
                </div>
              </CardContent>
            </Card>
          )}
          <Button className="w-full" disabled={!areaN || apply.isPending} onClick={() => apply.mutate()}>
            {apply.isPending
              ? lang === "uk"
                ? "Додаємо…"
                : "Добавляем…"
              : `${lang === "uk" ? "Додати" : "Добавить"} ${preview.length} ${
                  lang === "uk"
                    ? plural(preview.length, "позицію", "позиції", "позицій")
                    : plural(preview.length, "позицию", "позиции", "позиций")
                }`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------- Комментарии (диалог с заказчиком) ---------- */

function CommentsCard({ estimateId }: { estimateId: number }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const [text, setText] = React.useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["comments", estimateId],
    queryFn: () => api.comments(estimateId),
  });

  const add = useMutation({
    mutationFn: () => api.addComment(estimateId, "master", text.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", estimateId] });
      setText("");
    },
    onError: (e) => toast.error(lang === "uk" ? "Коментар не пішов" : "Комментарий не ушёл", { description: e.message }),
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" />
          <p className="text-sm font-bold">{lang === "uk" ? "Коментарі" : "Комментарии"}</p>
          <span className="text-[11px] text-muted-foreground">
            {lang === "uk" ? "питання замовника — відповіді майстра" : "вопросы заказчика — ответы мастера"}
          </span>
        </div>
        {isLoading ? (
          <ListSkeleton rows={2} height="h-12" />
        ) : (data?.items ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {lang === "uk"
              ? "Поки тихо. Надішліть кошторис замовнику — питання з'являться тут і в його кабінеті."
              : "Пока тихо. Отправьте смету заказчику — вопросы появятся здесь и в его кабинете."}
          </p>
        ) : (
          <div className="space-y-2">
            {(data?.items ?? []).map((c) => (
              <div
                key={c.id}
                className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                  c.author === "master"
                    ? "ml-auto rounded-br-sm bg-primary/15 text-foreground"
                    : "rounded-bl-sm bg-muted text-foreground",
                )}
              >
                <p>{c.text}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {c.author === "master" ? (lang === "uk" ? "Майстер" : "Мастер") : lang === "uk" ? "Замовник" : "Заказчик"}{" "}
                  · {dateTime(c.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) add.mutate();
            }}
            placeholder={lang === "uk" ? "Відповісти замовнику…" : "Ответить заказчику…"}
            aria-label={lang === "uk" ? "Коментар майстра" : "Комментарий мастера"}
          />
          <Button
            size="icon"
            disabled={!text.trim() || add.isPending}
            onClick={() => add.mutate()}
            aria-label={lang === "uk" ? "Надіслати" : "Отправить"}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Сборка недельного акта ---------- */

function ActBuilder({
  estimateId,
  lines,
  onClose,
}: {
  estimateId: number;
  lines: EstimateLineDTO[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { t, lang } = useI18n();
  const eligible = lines.filter((l) => l.remainingQty > 0.001);

  const [checked, setChecked] = React.useState<Set<number>>(() => new Set());
  const [qtys, setQtys] = React.useState<Record<number, string>>(() =>
    Object.fromEntries(eligible.map((l) => [l.id, fmtQty(l.remainingQty)])),
  );
  const [from, setFrom] = React.useState(() => isoDate(new Date(Date.now() - 7 * 86400000)));
  const [to, setTo] = React.useState(() => isoDate(new Date()));

  const qtyOf = (l: EstimateLineDTO) => parseNum(qtys[l.id] ?? "");
  const invalid = (l: EstimateLineDTO) => {
    const v = qtyOf(l);
    return !(v > 0) || v > l.remainingQty + 0.001;
  };
  const sumOf = (l: EstimateLineDTO) => Math.max(0, qtyOf(l) || 0) * l.price;

  const selected = eligible.filter((l) => checked.has(l.id));
  const selectedInvalid = selected.some(invalid);
  const totalSum = selected.reduce((s, l) => s + sumOf(l), 0);

  const toggle = (l: EstimateLineDTO) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(l.id)) next.delete(l.id);
      else next.add(l.id);
      return next;
    });

  const clamp = (l: EstimateLineDTO) => {
    const v = qtyOf(l);
    if (!(v > 0)) {
      setQtys((p) => ({ ...p, [l.id]: fmtQty(l.remainingQty) }));
    } else if (v > l.remainingQty + 0.001) {
      setQtys((p) => ({ ...p, [l.id]: fmtQty(l.remainingQty) }));
      toast.warning(
        lang === "uk"
          ? `Максимум ${fmtQty(l.remainingQty)} ${l.unit} — стільки лишилось по рядку`
          : `Максимум ${fmtQty(l.remainingQty)} ${l.unit} — столько осталось по строке`,
      );
    }
  };

  const create = useMutation({
    mutationFn: () =>
      api.estimateAct(
        estimateId,
        selected.map((l) => ({ lineId: l.id, qty: Math.round(qtyOf(l) * 100) / 100 })),
        { from: from || undefined, to: to || undefined },
      ),
    onSuccess: (r) => {
      qc.invalidateQueries();
      onClose();
      toast.success(
        lang === "uk" ? `Акт №${r.actNo} створено` : `Акт №${r.actNo} создан`,
        {
          description: `${selected.length} ${
            lang === "uk"
              ? plural(selected.length, "позиція", "позиції", "позицій")
              : plural(selected.length, "позиция", "позиции", "позиций")
          } · ${money(totalSum)}`,
        },
      );
      navigate(`#/acts/${r.actId}`);
    },
    onError: (e) =>
      toast.error(lang === "uk" ? "Акт не створився" : "Акт не создался", { description: e.message }),
  });

  if (eligible.length === 0) {
    return (
      <Empty
        icon={ClipboardList}
        title={lang === "uk" ? "Відкритих рядків немає" : "Открытых строк нет"}
        sub={
          lang === "uk"
            ? "Усе вже включено в акти або кошторис порожній."
            : "Всё уже включено в акты или смета пустая."
        }
        className="border-0"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="max-h-[48dvh] space-y-2 overflow-y-auto scroll-thin pr-0.5">
        {eligible.map((l) => {
          const isChecked = checked.has(l.id);
          const bad = invalid(l);
          return (
            <div
              key={l.id}
              className={cn(
                "rounded-xl border bg-card p-2.5 transition-colors",
                isChecked ? "border-primary/50" : "border-border/70",
              )}
            >
              <div className="flex items-start gap-2.5">
                <Checkbox checked={isChecked} onCheckedChange={() => toggle(l)} className="mt-0.5" aria-label={l.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">{l.name}</p>
                    {l.hidden && <HiddenBadge compact />}
                    {l.section && (
                      <span className="shrink-0 rounded-full border border-border/60 bg-muted/60 px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                        {sectionLabel(l.section, lang)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {lang === "uk"
                      ? `${t("estimateRemaining")}: ${fmtQty(l.remainingQty)} ${l.unit} з ${fmtQty(l.qty)}`
                      : `${t("estimateRemaining")}: ${fmtQty(l.remainingQty)} ${l.unit} из ${fmtQty(l.qty)}`}
                  </p>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-8">
                <Input
                  value={qtys[l.id] ?? ""}
                  onChange={(e) => setQtys((p) => ({ ...p, [l.id]: e.target.value }))}
                  onBlur={() => clamp(l)}
                  inputMode="decimal"
                  aria-label={t("estimateQty")}
                  aria-invalid={bad}
                  className={cn("num h-8 w-20 text-right", isChecked && bad && "border-danger focus-visible:ring-danger/30")}
                />
                <span className="w-10 text-xs text-muted-foreground">{l.unit}</span>
                <span className="text-xs text-muted-foreground">×</span>
                <span className="num text-xs text-muted-foreground">
                  {fmtQty(l.price)} {t("uah")}
                </span>
                <span className="text-xs text-muted-foreground">=</span>
                <span className="num ml-auto text-sm font-bold">{bad ? "—" : money(sumOf(l))}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]">
            {t("actPeriod")} · {t("actFrom")}
          </Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("actPeriod")} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{t("actTo")}</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[11px] text-muted-foreground">
            {lang === "uk" ? "обрано" : "выбрано"} {selected.length}{" "}
            {lang === "uk"
              ? plural(selected.length, "рядок", "рядки", "рядків")
              : plural(selected.length, "строка", "строки", "строк")}
          </p>
          <p className="num text-xl font-extrabold">{money(totalSum)}</p>
        </div>
        <Button
          className="font-semibold"
          disabled={selected.length === 0 || selectedInvalid || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending && <ButtonSpinner />}
          {t("actsNew")}
        </Button>
      </div>
    </div>
  );
}

function WeeklyActDialog({
  open,
  onOpenChange,
  estimateId,
  lines,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  estimateId: number;
  lines: EstimateLineDTO[];
}) {
  const { t } = useI18n();
  const desktop = useDesktop();
  // при каждом открытии — свежее состояние билдера
  const [session, setSession] = React.useState(0);
  const handleOpen = (v: boolean) => {
    if (v) setSession((s) => s + 1);
    onOpenChange(v);
  };
  const builder = <ActBuilder key={session} estimateId={estimateId} lines={lines} onClose={() => onOpenChange(false)} />;

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto scroll-thin sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="size-5 text-primary" /> {t("estimateWeeklyAct")}
            </DialogTitle>
            <DialogDescription>{t("estimateWeeklyActSub")}</DialogDescription>
          </DialogHeader>
          {builder}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto scroll-thin px-4 pb-5">
        <SheetHeader className="px-0">
          <SheetTitle className="flex items-center gap-2 text-left">
            <CalendarDays className="size-5 text-primary" /> {t("estimateWeeklyAct")}
          </SheetTitle>
        </SheetHeader>
        {builder}
      </SheetContent>
    </Sheet>
  );
}

/* ---------- Экран сметы ---------- */

export function EstimateDetailView({ id }: { id: number }) {
  const qc = useQueryClient();
  const { t, lang } = useI18n();
  const [tplOpen, setTplOpen] = React.useState(false);
  const [roomOpen, setRoomOpen] = React.useState(false);
  const [weekOpen, setWeekOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["estimate", id],
    queryFn: () => api.estimate(id),
  });

  const patchEst = useMutation({
    mutationFn: (patch: { status?: string; coeff?: number; title?: string }) => api.patchEstimate(id, patch),
    onSuccess: (est) => {
      qc.invalidateQueries({ queryKey: ["estimate", id] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      return est;
    },
  });

  const del = useMutation({
    mutationFn: () => api.deleteEstimate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      toast.success(lang === "uk" ? "Кошторис видалено" : "Смета удалена");
      navigate("#/estimates");
    },
  });

  if (isLoading) return <ListSkeleton rows={4} height="h-28" />;
  if (error || !data)
    return (
      <div className="space-y-4 fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate("#/estimates")}>
          ← {lang === "uk" ? "До кошторисів" : "К сметам"}
        </Button>
        <ErrorCard message={error?.message ?? (lang === "uk" ? "Кошторис не знайдено" : "Смета не найдена")} onRetry={() => refetch()} />
      </div>
    );

  const { estimate: est, lines, object } = data;

  const sendToClient = () => {
    patchEst.mutate(
      { status: est.status === "draft" ? "sent" : est.status },
      {
        onSuccess: () => {
          const url = `${window.location.origin}/#/client/${object.clientToken}`;
          toast.success(
            lang === "uk" ? "Кошторис надіслано замовнику" : "Смета отправлена заказчику",
            {
              description:
                lang === "uk" ? "Статус: у замовника. Посилання скопійовано." : "Статус: у заказчика. Ссылка скопирована.",
              action: {
                label: lang === "uk" ? "Відкрити кабінет" : "Открыть кабинет",
                onClick: () => navigate(`#/client/${object.clientToken}`),
              },
            },
          );
          void navigator.clipboard?.writeText(url).catch(() => {});
        },
      },
    );
  };

  return (
    <div className="space-y-4 fade-in pb-24">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("#/estimates")}>
        ← {lang === "uk" ? "До кошторисів" : "К сметам"}
      </Button>

      {/* Шапка */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">{est.title}</h1>
          <button
            type="button"
            className="mt-0.5 text-[13px] text-muted-foreground hover:text-foreground"
            onClick={() => navigate(`#/objects/${est.objectId}`)}
          >
            {object.name} · {lang === "uk" ? "замовник" : "заказчик"} {object.customer}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge kind="estimate" value={est.status} />
          <Button variant="outline" size="sm" onClick={() => navigate(`#/client/${object.clientToken}`)}>
            {t("navClient")}
          </Button>
        </div>
      </div>

      {/* Панель инструментов */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="font-semibold" onClick={() => setWeekOpen(true)}>
          <CalendarDays className="size-4" /> {t("estimateWeeklyAct")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setTplOpen(true)}>
          <Layers className="size-4" /> {t("estimateTemplates")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRoomOpen(true)}>
          <Sparkles className="size-4" /> {t("estimateRooms")}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={api.exportEstimateXlsxURL(id)} download>
            <Download className="size-4" /> XLSX
          </a>
        </Button>
        {est.status !== "done" && (
          <Button size="sm" variant="outline" onClick={sendToClient} disabled={patchEst.isPending}>
            <Send className="size-4" /> {t("estimateSend")}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">{lang === "uk" ? "коеф." : "коэфф."}</span>
          <div className="flex items-center overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              className="pressable px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
              aria-label={lang === "uk" ? "Зменшити коефіцієнт" : "Уменьшить коэффициент"}
              onClick={() => patchEst.mutate({ coeff: Math.max(1, Math.round((est.coeff - 0.05) * 100) / 100) })}
            >
              <Minus className="size-3.5" />
            </button>
            <span className="num w-12 text-center text-sm font-bold">×{String(est.coeff).replace(".", ",")}</span>
            <button
              type="button"
              className="pressable px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
              aria-label={lang === "uk" ? "Збільшити коефіцієнт" : "Увеличить коэффициент"}
              onClick={() => patchEst.mutate({ coeff: Math.min(2, Math.round((est.coeff + 0.05) * 100) / 100) })}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {est.note && <p className="text-xs text-muted-foreground">{est.note}</p>}

      {/* Быстрый ввод */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-3.5">
          <QuickAdd estimateId={id} />
        </CardContent>
      </Card>

      {/* Позиции */}
      {lines.length === 0 ? (
        <Empty
          icon={SquarePen}
          title={lang === "uk" ? "Кошторис порожній" : "Смета пустая"}
          sub={
            lang === "uk"
              ? "Додайте першу позицію рядком вище, вставте шаблон техциклу або порахуйте типове приміщення."
              : "Добавьте первую позицию строкой выше, вставьте шаблон техцикла или посчитайте типовое помещение."
          }
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setTplOpen(true)}>
                <Layers className="size-4" /> {t("estimateTemplates")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRoomOpen(true)}>
                <Sparkles className="size-4" /> {t("estimateRooms")}
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-2">
          {lines.map((l) => (
            <LineRow key={l.id} estimateId={id} line={l} />
          ))}
        </div>
      )}

      {/* Комментарии */}
      <CommentsCard estimateId={id} />

      {/* Опасная зона */}
      <div className="flex justify-end">
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
              <Trash2 className="size-4" /> {lang === "uk" ? "Видалити кошторис" : "Удалить смету"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {lang === "uk" ? "Видалити" : "Удалить"} «{est.title}»?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {lang === "uk"
                  ? `Зникнуть ${lines.length} ${plural(lines.length, "позиція", "позиції", "позицій")}. Створені акти залишаться.`
                  : `Уйдут ${lines.length} ${plural(lines.length, "позиция", "позиции", "позиций")}. Созданные акты останутся.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => del.mutate()}>
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Липкие итоги */}
      <div className="sticky bottom-20 z-30 lg:bottom-4">
        <Card className="border-primary/40 shadow-xl">
          <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4">
            <div className="leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {lang === "uk" ? "Разом з коеф." : "Всего с коэфф."}
              </p>
              <p className="num text-2xl font-extrabold">{money(est.total)}</p>
            </div>
            <Separator orientation="vertical" className="hidden h-9 sm:block" />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>
                {lang === "uk" ? "чистові" : "чистовые"} <b className="num text-foreground">{moneyShort(est.visible)}</b>
              </span>
              <span>
                {t("estimateHidden").toLowerCase()}{" "}
                <b className="num text-foreground">
                  {moneyShort(est.hidden)} ({est.hiddenShare}%)
                </b>
              </span>
              <span>
                {lang === "uk" ? "закрито актами" : "закрыто актами"}{" "}
                <b className="num text-foreground">{moneyShort(est.actedSum)}</b>
              </span>
              <span>
                {t("estimateRemaining")} <b className="num text-foreground">{moneyShort(est.remainingSum)}</b>
              </span>
              <span>
                {lang === "uk" ? "позицій" : "позиций"} <b className="num text-foreground">{est.lines}</b>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <TemplatesSheet open={tplOpen} onOpenChange={setTplOpen} estimateId={id} />
      <RoomSheet open={roomOpen} onOpenChange={setRoomOpen} estimateId={id} />
      <WeeklyActDialog open={weekOpen} onOpenChange={setWeekOpen} estimateId={id} lines={lines} />
    </div>
  );
}
