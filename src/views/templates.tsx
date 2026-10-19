"use client";

// Шаблоны работ: техциклы из прайса («Стена под покраску» = грунт → шпаклёвка →
// шлифовка → покраска), вставляются в смету одним тапом.

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type PriceItemDTO, type TemplateDTO } from "@/lib/api";
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
import { Empty, ErrorCard, HiddenBadge, ListSkeleton, SectionHead } from "@/components/kit";
import { Layers, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function TemplatesView() {
  const qc = useQueryClient();
  const { t, lang } = useI18n();
  const uk = lang === "uk";
  const [createOpen, setCreateOpen] = React.useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["templates"], queryFn: api.templates });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success(uk ? "Шаблон видалено" : "Шаблон удалён");
    },
  });

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between gap-3">
        <div className="leading-tight">
          <h1 className="text-xl font-bold tracking-tight">{uk ? "Шаблони робіт" : "Шаблоны работ"}</h1>
          <p className="text-[13px] text-muted-foreground">
            {uk
              ? "техцикли одним тапом — рутинне перебивання рядків з Excel закінчується"
              : "техциклы одним тапом — рутинное перебивание строк из Excel заканчивается"}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus className="size-4" /> <span className="hidden sm:inline">Шаблон</span>
        </Button>
      </div>

      {isLoading ? (
        <ListSkeleton rows={3} height="h-32" />
      ) : error ? (
        <ErrorCard message={error.message} onRetry={() => refetch()} />
      ) : (data?.items ?? []).length === 0 ? (
        <Empty
          icon={Layers}
          title={uk ? "Шаблонів немає" : "Шаблонов нет"}
          sub={
            uk
              ? "Шаблон — збережений набір позицій: «Стіна під фарбування» ціліком вставиться в будь-який кошторис."
              : "Шаблон — сохранённый набор позиций: «Стена под покраску» целиком вставится в любую смету."
          }
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> {uk ? "Створити шаблон" : "Создать шаблон"}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(data?.items ?? []).map((tpl) => (
            <Card key={tpl.id} className="border-border">
              <CardContent className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold leading-tight">{tpl.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {tpl.lines.length}{" "}
                      {uk
                        ? plural(tpl.lines.length, "позиція", "позиції", "позицій")
                        : plural(tpl.lines.length, "позиция", "позиции", "позиций")}{" "}
                      · {uk ? "у шаблоні" : "в шаблоне"}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        aria-label={uk ? "Видалити шаблон" : "Удалить шаблон"}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {uk ? "Видалити" : "Удалить"} «{tpl.name}»?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {uk
                            ? "Кошториси, куди шаблон уже вставлено, не зміняться."
                            : "Сметы, куда шаблон уже вставлен, не изменятся."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{uk ? "Залишити" : "Оставить"}</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => del.mutate(tpl.id)}>
                          {t("delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <ol className="space-y-1">
                  {tpl.lines.map((l, i) => (
                    <li key={i} className="flex items-center gap-2 text-[13px]">
                      <span className="num w-4 shrink-0 text-[10px] text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{l.name}</span>
                      {l.hidden && <HiddenBadge compact />}
                      <span className="num shrink-0 text-xs text-muted-foreground">
                        {l.unit ? `1 ${l.unit} · ` : ""}
                        {money(l.price)}
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function TemplateCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { t, lang } = useI18n();
  const uk = lang === "uk";
  const [name, setName] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [picked, setPicked] = React.useState<PriceItemDTO[]>([]);
  const [hiddenSet, setHiddenSet] = React.useState<Set<number>>(new Set());

  const price = useQuery({ queryKey: ["price"], queryFn: () => api.price() });

  React.useEffect(() => {
    if (open) {
      setName("");
      setSearch("");
      setPicked([]);
      setHiddenSet(new Set());
    }
  }, [open]);

  const results = React.useMemo(() => {
    const items = price.data?.items ?? [];
    if (!search.trim()) return items.slice(0, 6);
    return items.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8);
  }, [price.data, search]);

  const save = useMutation({
    mutationFn: () =>
      api.upsertTemplate(
        name.trim(),
        picked.map((p) => ({ name: p.name, qty: 1, unit: p.unit, price: p.price, hidden: hiddenSet.has(p.id) })),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      onOpenChange(false);
      toast.success(uk ? "Шаблон збережено" : "Шаблон сохранён", {
        description: uk
          ? "Вставляється в кошторис кнопкою «Шаблон»"
          : "Вставляется в смету кнопкой «Шаблон»",
      });
    },
    onError: (e) => toast.error(uk ? "Не збереглося" : "Не сохранилось", { description: e.message }),
  });

  const togglePick = (item: PriceItemDTO) => {
    setPicked((prev) => {
      const exists = prev.find((p) => p.id === item.id);
      if (exists) return prev.filter((p) => p.id !== item.id);
      return [...prev, item];
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-5 text-primary" /> {uk ? "Новий шаблон" : "Новый шаблон"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3.5 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">{t("objectsName")} *</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={uk ? "Санвузол під плитку (повний цикл)" : "Санузел под плитку (полный цикл)"}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>{uk ? "Пошук позицій з прайсу" : "Поиск позиций из прайса"}</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={uk ? "штукатурка, ґрунтовка…" : "штукатурка, грунтовка…"}
            />
            <div className="max-h-44 space-y-1 overflow-y-auto scroll-thin rounded-xl border border-border p-1.5">
              {results.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {uk ? "Нічого не знайшлось" : "Ничего не нашлось"}
                </p>
              )}
              {results.map((item) => {
                const active = !!picked.find((p) => p.id === item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => togglePick(item)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                      active ? "bg-primary/15" : "hover:bg-accent",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.name}
                      {item.unit && <span className="text-muted-foreground"> · {item.unit}</span>}
                    </span>
                    <span className="num text-xs font-semibold">{money(item.price)}</span>
                    {active && <Plus className="size-3.5 rotate-45 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>

          {picked.length > 0 && (
            <div className="space-y-1.5">
              <SectionHead title={`${uk ? "У шаблоні" : "В шаблоне"} (${picked.length})`} />
              <ol className="space-y-1 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-2">
                {picked.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2 text-[13px]">
                    <span className="num w-4 text-[10px] text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setHiddenSet((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        })
                      }
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                        hiddenSet.has(p.id)
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground/70 hover:text-foreground",
                      )}
                      title={uk ? "Позначити як приховану підготовку" : "Пометить как скрытую подготовку"}
                    >
                      {uk ? "прихована" : "скрытая"}
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePick(p)}
                      className="rounded-md p-1 text-muted-foreground/50 hover:text-danger"
                      aria-label={uk ? "Прибрати із шаблону" : "Убрать из шаблона"}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button disabled={!name.trim() || picked.length === 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? (uk ? "Зберігаємо…" : "Сохраняем…") : uk ? "Зберегти шаблон" : "Сохранить шаблон"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
