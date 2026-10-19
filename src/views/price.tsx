"use client";

// Прайс-лист: единый каталог цен против «дрейфа». Поиск, категории,
// добавление/обновление с честным «было → стало», удаление.

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type PriceItemDTO } from "@/lib/api";
import { money, plural } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty, ErrorCard, FilterChips, ListSkeleton, SearchInput } from "@/components/kit";
import { ArrowRight, PiggyBank, Plus, Trash2 } from "lucide-react";

const UNITS = ["м²", "м.п", "шт", "компл", ""];

function PriceRow({ item, onEdit }: { item: PriceItemDTO; onEdit: (i: PriceItemDTO) => void }) {
  const { t, lang } = useI18n();
  const uk = lang === "uk";
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api.deletePrice(item.name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(
        uk ? `«${item.name}» видалена з прайсу` : `«${item.name}» удалена из прайса`,
      );
    },
    onError: (e) => toast.error(uk ? "Не видалилось" : "Не удалилось", { description: e.message }),
  });

  return (
    <div className="group flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {item.category}
          {item.unit && ` · за ${item.unit}`}
          {item.sourceDate && ` · ${item.sourceDate}`}
        </p>
        {item.note && (
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">{item.note}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="num text-sm font-bold">{money(item.price)}</span>
        <span className="rounded-full bg-muted px-1.5 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
          {item.source}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => onEdit(item)}
      >
        <ArrowRight className="size-3" /> {t("edit")}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            aria-label={uk ? "Видалити позицію прайсу" : "Удалить позицию прайса"}
            className="rounded-lg p-1.5 text-muted-foreground/40 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {uk ? "Видалити" : "Удалить"} «{item.name}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {uk
                ? "Вже створені акти і кошториси не перераховуються — ціна піде лише з підказок."
                : "Уже созданные акты и сметы не пересчитываются — цена уйдёт только из подсказок."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uk ? "Залишити" : "Оставить"}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => del.mutate()}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function PriceView() {
  const qc = useQueryClient();
  const { t, lang } = useI18n();
  const uk = lang === "uk";
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PriceItemDTO | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["price"],
    queryFn: () => api.price(),
  });

  const categories = React.useMemo(() => {
    const set = new Set((data?.items ?? []).map((i) => i.category));
    return ["all", ...[...set].sort((a, b) => a.localeCompare(b, "ru"))];
  }, [data]);

  const filtered = React.useMemo(() => {
    const list = data?.items ?? [];
    return list.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (q.trim()) return i.name.toLowerCase().includes(q.trim().toLowerCase());
      return true;
    });
  }, [data, category, q]);

  const upsert = useMutation({
    mutationFn: (v: { name: string; unit: string; price: number; category: string }) =>
      api.upsertPrice(v.name, v.unit, v.price, v.category),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["price"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDialogOpen(false);
      if (r.changed) {
        toast.success(
          `${uk ? "Оновлено: було" : "Обновлено: было"} ${money(r.prev)} → стало ${money(r.item.price)}`,
          {
            description: uk
              ? "Створені акти не перераховуються — нова ціна піде в наступні"
              : "Созданные акты не пересчитываются — новая цена пойдёт в следующие",
          },
        );
      } else if (r.existed) {
        toast.info(uk ? "Ціна не змінилась" : "Цена не изменилась");
      } else {
        toast.success(uk ? `«${r.item.name}» додана до прайсу` : `«${r.item.name}» добавлена в прайс`);
      }
    },
    onError: (e) => toast.error(uk ? "Не збереглося" : "Не сохранилось", { description: e.message }),
  });

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between gap-3">
        <div className="leading-tight">
          <h1 className="text-xl font-bold tracking-tight">{t("navPrice")}</h1>
          <p className="text-[13px] text-muted-foreground">
            {data?.count ?? "…"}{" "}
            {uk
              ? plural(data?.count ?? 0, "позиція", "позиції", "позицій")
              : plural(data?.count ?? 0, "позиция", "позиции", "позиций")}{" "}
            · {t("navPriceSub")} · {uk ? "джерело у кожної ціни" : "источник у каждой цены"}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          className="shrink-0"
        >
          <Plus className="size-4" /> <span className="hidden sm:inline">{uk ? "Позиція" : "Позиция"}</span>
        </Button>
      </div>

      <div className="space-y-2.5">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder={uk ? "Пошук: штукатурка, плитка…" : "Поиск: штукатурка, плитка…"}
        />
        <FilterChips
          value={category}
          onChange={setCategory}
          options={categories.map((c) => ({ value: c, label: c === "all" ? t("all") : c }))}
        />
      </div>

      {isLoading ? (
        <ListSkeleton rows={5} height="h-12" />
      ) : error ? (
        <ErrorCard message={error.message} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        q || category !== "all" ? (
          <Empty
            icon={PiggyBank}
            title={uk ? "Нічого не знайшлось" : "Ничего не нашлось"}
            sub={
              uk
                ? "Спробуйте інший запит — або додайте позицію в прайс"
                : "Попробуйте другой запрос — или добавьте позицию в прайс"
            }
            action={
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="size-4" /> {t("estimateAdd")}
              </Button>
            }
          />
        ) : (
          <Empty
            icon={PiggyBank}
            title={uk ? "Прайс порожній" : "Прайс пустой"}
            sub={
              uk
                ? "Заповніть його один раз — далі ціни підставляються в кошториси і акти самі, текстом і голосом."
                : "Заполните его один раз — дальше цены подставляются в сметы и акты сами, текстом и голосом."
            }
          />
        )
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/70 p-0">
            {filtered.map((item) => (
              <PriceRow
                key={item.id}
                item={item}
                onEdit={(i) => {
                  setEditing(i);
                  setDialogOpen(true);
                }}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <PriceUpsertDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        categories={categories.filter((c) => c !== "all")}
        onSubmit={(v) => upsert.mutate(v)}
        pending={upsert.isPending}
      />
    </div>
  );
}

function PriceUpsertDialog({
  open,
  onOpenChange,
  initial,
  categories,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: PriceItemDTO | null;
  categories: string[];
  onSubmit: (v: { name: string; unit: string; price: number; category: string }) => void;
  pending?: boolean;
}) {
  const [name, setName] = React.useState("");
  const [unit, setUnit] = React.useState("м²");
  const [price, setPrice] = React.useState("");
  const [category, setCategory] = React.useState(categories[0] ?? "Прочее");
  const { t, lang } = useI18n();
  const uk = lang === "uk";

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setUnit(initial?.unit ?? "м²");
      setPrice(initial ? String(initial.price) : "");
      setCategory(initial?.category ?? categories[0] ?? "Прочее");
    }
  }, [open, initial, categories]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PiggyBank className="size-5 text-primary" />
            {initial ? (uk ? "Змінити ціну" : "Изменить цену") : uk ? "Нова позиція прайсу" : "Новая позиция прайса"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3.5 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="pr-name">{t("objectsName")} *</Label>
            <Input
              id="pr-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={uk ? "штукатурка стін" : "штукатурка стен"}
              autoFocus={!initial}
              disabled={!!initial}
            />
            {initial && (
              <p className="text-[11px] text-muted-foreground">
                {uk ? "Поточна ціна:" : "Текущая цена:"} <b className="num">{money(initial.price)}</b>{" "}
                {uk ? "— запишіть нову, ціна оновиться." : "— запишите новую, цена обновится."}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <Label>{uk ? "Одиниця" : "Единица"}</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u || "empty"} value={u || "empty"}>
                      {u || (uk ? "за все" : "за всё")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{uk ? "Категорія" : "Категория"}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-price">{uk ? "Ціна, грн" : "Цена, грн"} *</Label>
            <Input
              id="pr-price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="260"
              autoFocus={!!initial}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!name.trim() || !price || pending}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                unit: unit === "empty" ? "" : unit,
                price: parseFloat(price.replace(",", ".")) || 0,
                category,
              })
            }
          >
            {pending ? (uk ? "Зберігаємо…" : "Сохраняем…") : initial ? (uk ? "Оновити" : "Обновить") : t("estimateAdd")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
