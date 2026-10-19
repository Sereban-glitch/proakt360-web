"use client";

// Сметы: поиск, фильтры по статусу и объекту, карточки с деньгами/прогрессом,
// создание новой сметы (?new=1 открывает форму сразу).

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { dateShort, EST_STATUS, money, plural } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { navigate, useRoute } from "@/lib/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Empty, ErrorCard, FilterChips, HiddenBadge, ListSkeleton, SearchInput, StatusBadge } from "@/components/kit";
import { FileSpreadsheet, Ghost, Plus, Trash2 } from "lucide-react";
import { ObjectCreateDialog } from "@/views/objects";

type Filter = "all" | "draft" | "sent" | "approved" | "done";

export function EstimatesView() {
  const route = useRoute();
  const qc = useQueryClient();
  const { t, lang } = useI18n();
  const uk = lang === "uk";
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [createOpen, setCreateOpen] = React.useState(route.query.get("new") === "1");
  const [objectCreateOpen, setObjectCreateOpen] = React.useState(false);

  const estimates = useQuery({ queryKey: ["estimates"], queryFn: () => api.estimates() });
  const objects = useQuery({ queryKey: ["objects"], queryFn: api.objects });

  const create = useMutation({
    mutationFn: (v: { objectId: number; title: string; coeff: number; note: string }) =>
      api.createEstimate(v.objectId, v.title, v.coeff, v.note),
    onSuccess: (est) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setCreateOpen(false);
      toast.success(uk ? "Кошторис створено" : "Смета создана", {
        description: uk
          ? "Додайте позиції рядком, шаблоном або приміщенням"
          : "Добавьте позиции строкой, шаблоном или помещением",
      });
      navigate(`#/estimates/${est.id}`);
    },
    onError: (e) => toast.error(uk ? "Не вийшло" : "Не получилось", { description: e.message }),
  });

  const filtered = React.useMemo(() => {
    const list = estimates.data ?? [];
    return list.filter((e) => {
      if (filter !== "all" && e.status !== filter) return false;
      if (q.trim()) {
        const s = q.trim().toLowerCase();
        return e.title.toLowerCase().includes(s) || e.objectName.toLowerCase().includes(s);
      }
      return true;
    });
  }, [estimates.data, filter, q]);

  const counts = React.useMemo(() => {
    const list = estimates.data ?? [];
    return {
      all: list.length,
      draft: list.filter((e) => e.status === "draft").length,
      sent: list.filter((e) => e.status === "sent").length,
      approved: list.filter((e) => e.status === "approved").length,
      done: list.filter((e) => e.status === "done").length,
    };
  }, [estimates.data]);

  const objectList = objects.data ?? [];
  const noObjects = !objects.isLoading && objectList.length === 0;

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between gap-3">
        <div className="leading-tight">
          <h1 className="text-xl font-bold tracking-tight">{t("estimatesTitle")}</h1>
          <p className="text-[13px] text-muted-foreground">
            {uk ? "план робіт і гроші до ремонту" : "план работ и деньги до ремонта"}
          </p>
        </div>
        <Button
          onClick={() => (noObjects ? setObjectCreateOpen(true) : setCreateOpen(true))}
          className="shrink-0"
        >
          <Plus className="size-4" /> <span className="hidden sm:inline">{uk ? "Кошторис" : "Смета"}</span>
        </Button>
      </div>

      <div className="space-y-2.5">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder={uk ? "Пошук за кошторисом або об'єктом…" : "Поиск по смете или объекту…"}
        />
        <FilterChips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("all"), count: counts.all },
            { value: "draft", label: uk ? "Чернетки" : "Черновики", count: counts.draft },
            { value: "sent", label: t("estimateStatusSent"), count: counts.sent },
            { value: "approved", label: uk ? "Погоджені" : "Согласованы", count: counts.approved },
            { value: "done", label: uk ? "Закриті" : "Закрыты", count: counts.done },
          ]}
        />
      </div>

      {estimates.isLoading ? (
        <ListSkeleton rows={3} height="h-32" />
      ) : estimates.error ? (
        <ErrorCard message={estimates.error.message} onRetry={() => estimates.refetch()} />
      ) : noObjects ? (
        <Empty
          icon={FileSpreadsheet}
          title={uk ? "Спершу потрібен об'єкт" : "Сначала нужен объект"}
          sub={
            uk
              ? "Кошторис завжди прив'язаний до об'єкта — так замовник бачить свої гроші за своїм житлом."
              : "Смета всегда привязана к объекту — так заказчик видит свои деньги по своему жилью."
          }
          action={
            <Button onClick={() => setObjectCreateOpen(true)}>
              <Plus className="size-4" /> {uk ? "Додати об'єкт" : "Добавить объект"}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        q || filter !== "all" ? (
          <Empty
            icon={FileSpreadsheet}
            title={uk ? "Нічого не знайшлось" : "Ничего не нашлось"}
            sub={uk ? "Змініть запит або скиньте фільтр" : "Смените запрос или сбросьте фильтр"}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQ("");
                  setFilter("all");
                }}
              >
                {uk ? "Скинути" : "Сбросить"}
              </Button>
            }
          />
        ) : (
          <Empty
            icon={FileSpreadsheet}
            title={uk ? "Кошторисів ще немає" : "Смет ещё нет"}
            sub={
              uk
                ? "Кошторис — план робіт: позиції рядком «шпаклівка 45 м² 180», шаблони техциклів, приміщення з нормами і коефіцієнт складності."
                : "Смета — план работ: позиции строкой «шпаклёвка 45 м² 180», шаблоны техциклов, помещения с нормами и коэффициент сложности."
            }
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" /> {uk ? "Перший кошторис" : "Первая смета"}
              </Button>
            }
          />
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((est) => (
            <Card
              key={est.id}
              className="pressable cursor-pointer border-border transition-colors hover:border-primary/40"
              onClick={() => navigate(`#/estimates/${est.id}`)}
            >
              <CardContent className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold">{est.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {est.objectName} · {dateShort(est.createdAt)}
                    </p>
                  </div>
                  <StatusBadge kind="estimate" value={est.status} />
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="num text-xl font-extrabold">{money(est.total)}</span>
                  {est.coeff !== 1 && (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {uk ? "коеф" : "коэфф"} ×{String(est.coeff).replace(".", ",")}
                    </span>
                  )}
                </div>
                <Progress value={est.progress * 100} className="h-1.5 [&>div]:bg-primary" />
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>
                    {est.lines}{" "}
                    {uk
                      ? plural(est.lines, "позиція", "позиції", "позицій")
                      : plural(est.lines, "позиция", "позиции", "позиций")}
                    {est.progress > 0 &&
                      ` · ${uk ? "закрито" : "закрыто"} ${Math.round(est.progress * 100)}%`}
                  </span>
                  {est.hiddenShare > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Ghost className="size-3" /> {uk ? "прихованих" : "скрытых"} {est.hiddenShare}%
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EstimateCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        objects={objectList.map((o) => ({ id: o.id, name: o.name }))}
        onSubmit={(v) => create.mutate(v)}
        pending={create.isPending}
      />
      <ObjectCreateDialog
        open={objectCreateOpen}
        onOpenChange={setObjectCreateOpen}
        onSubmit={async (v) => {
          try {
            const o = await api.createObject(v.name, v.customer, v.address);
            qc.invalidateQueries({ queryKey: ["objects"] });
            setObjectCreateOpen(false);
            setCreateOpen(true);
            toast.success(uk ? "Об'єкт створено — тепер кошторис" : "Объект создан — теперь смета");
            void o;
          } catch (e) {
            toast.error(uk ? "Не вийшло" : "Не получилось", { description: e instanceof Error ? e.message : "" });
          }
        }}
      />
    </div>
  );
}

export function EstimateCreateDialog({
  open,
  onOpenChange,
  objects,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  objects: { id: number; name: string }[];
  onSubmit: (v: { objectId: number; title: string; coeff: number; note: string }) => void;
  pending?: boolean;
}) {
  const [objectId, setObjectId] = React.useState<number | null>(objects[0]?.id ?? null);
  const [title, setTitle] = React.useState("");
  const [coeff, setCoeff] = React.useState("1");
  const [note, setNote] = React.useState("");
  const { t, lang } = useI18n();
  const uk = lang === "uk";

  React.useEffect(() => {
    if (open) {
      setObjectId(objects[0]?.id ?? null);
      setTitle("");
      setCoeff("1");
      setNote("");
    }
  }, [open, objects]);

  const coeffNum = parseFloat(coeff.replace(",", ".")) || 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" /> {t("estimatesNew")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3.5 py-1">
          <div className="space-y-1.5">
            <Label>{uk ? "Об'єкт" : "Объект"} *</Label>
            <Select
              value={objectId ? String(objectId) : undefined}
              onValueChange={(v) => setObjectId(Number(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={uk ? "Оберіть об'єкт" : "Выберите объект"} />
              </SelectTrigger>
              <SelectContent>
                {objects.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="est-title">{t("objectsName")} *</Label>
            <Input
              id="est-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={uk ? "Малярні роботи під фарбування" : "Малярные работы под покраску"}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="est-coeff">{uk ? "Коефіцієнт складності" : "Коэффициент сложности"}</Label>
            <div className="flex flex-wrap gap-1.5">
              {["1", "1.1", "1.15", "1.3", "1.5", "2"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCoeff(c)}
                  className={
                    "num rounded-lg border px-2.5 py-1 text-sm font-semibold transition-colors " +
                    (coeff === c
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-accent")
                  }
                >
                  ×{c.replace(".", ",")}
                </button>
              ))}
            </div>
            <Input
              id="est-coeff"
              value={coeff}
              onChange={(e) => setCoeff(e.target.value)}
              className="mt-1 w-24"
              inputMode="decimal"
              aria-label={uk ? "Власний коефіцієнт" : "Свой коэффициент"}
            />
            <p className="text-xs text-muted-foreground">
              {uk
                ? "Стелі 280–300 см, сходи, стислі терміни — практика живого прайс-листа."
                : "Потолки 280–300 см, лестницы, сжатые сроки — практика живого прайс-листа."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="est-note">{uk ? "Нотатка" : "Заметка"}</Label>
            <Input
              id="est-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={uk ? "Наприклад: стелі 300 см — коеф. 1.30" : "Например: потолки 300 см — коэфф. 1.30"}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!objectId || !title.trim() || pending}
            onClick={() =>
              objectId &&
              onSubmit({ objectId, title: title.trim(), coeff: coeffNum, note: note.trim() })
            }
          >
            {pending ? (uk ? "Створюємо…" : "Создаём…") : uk ? "Створити" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
