"use client";

// Объекты: поиск, фильтр по статусу, карточки с деньгами/прогрессом/дедлайном.
// ?new=1 — сразу открыть форму создания.

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type ObjectBrief } from "@/lib/api";
import { daysLeft, money, moneyShort, OBJECT_STATUS, plural } from "@/lib/format";
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
import { Progress } from "@/components/ui/progress";
import { Empty, ErrorCard, FilterChips, ListSkeleton, SearchInput, StatusBadge } from "@/components/kit";
import { CalendarDays, Camera, ChevronRight, HardHat, Plus, User } from "lucide-react";

type Filter = "all" | "active" | "done" | "paused";

function ObjectCard({ o }: { o: ObjectBrief }) {
  const { lang } = useI18n();
  const uk = lang === "uk";
  const dl = o.deadline ? daysLeft(o.deadline) : null;
  return (
    <Card
      className="pressable cursor-pointer border-border transition-colors hover:border-primary/40"
      onClick={() => navigate(`#/objects/${o.id}`)}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold">{o.name}</p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <User className="size-3 shrink-0" /> {o.customer}
              {o.address && <span className="truncate">· {o.address}</span>}
            </p>
          </div>
          <StatusBadge kind="object" value={o.status} />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {o.acts} {uk ? plural(o.acts, "акт", "акти", "актів") : plural(o.acts, "акт", "акта", "актов")} · {o.photos}{" "}
              фото
            </span>
            <span className="num">{o.progress}% готово</span>
          </div>
          <Progress value={o.progress} className="h-1.5 [&>div]:bg-primary" />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="leading-tight">
            <p className="num text-lg font-extrabold">{money(o.total)}</p>
            <p className="text-[11px] text-muted-foreground">
              {uk ? "сплачено" : "оплачено"} {moneyShort(o.paid)}
              {o.debt > 0.01 ? ` · ${uk ? "борг" : "долг"} ${moneyShort(o.debt)}` : uk ? " · повністю" : " · полностью"}
            </p>
          </div>
          {dl && (
            <span
              className={
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
                (o.status === "done"
                  ? "bg-muted text-muted-foreground"
                  : dl.overdue
                    ? "bg-danger-soft text-danger"
                    : "bg-warn-soft text-warn")
              }
            >
              <CalendarDays className="size-3" />
              {o.status === "done" ? (uk ? "здано" : "сдан") : `${uk ? "здача" : "сдача"} ${dl.text}`}
            </span>
          )}
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export function ObjectsView() {
  const route = useRoute();
  const qc = useQueryClient();
  const { t, lang } = useI18n();
  const uk = lang === "uk";
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [createOpen, setCreateOpen] = React.useState(route.query.get("new") === "1");

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["objects"], queryFn: api.objects });

  const create = useMutation({
    mutationFn: (v: { name: string; customer: string; address: string }) =>
      api.createObject(v.name, v.customer, v.address),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ["objects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setCreateOpen(false);
      toast.success(
        uk ? `Об'єкт «${o.name}» створено` : `Объект «${o.name}» создан`,
        { description: uk ? "Етапи будівництва додано автоматично" : "Этапы стройки добавлены автоматически" },
      );
      navigate(`#/objects/${o.id}`);
    },
    onError: (e) =>
      toast.error(uk ? "Не вийшло створити об'єкт" : "Не получилось создать объект", { description: e.message }),
  });

  const filtered = React.useMemo(() => {
    const list = data ?? [];
    return list.filter((o) => {
      if (filter !== "all" && o.status !== filter) return false;
      if (q.trim()) {
        const s = q.trim().toLowerCase();
        return o.name.toLowerCase().includes(s) || o.customer.toLowerCase().includes(s);
      }
      return true;
    });
  }, [data, filter, q]);

  const counts = React.useMemo(() => {
    const list = data ?? [];
    return {
      all: list.length,
      active: list.filter((o) => o.status === "active").length,
      done: list.filter((o) => o.status === "done").length,
      paused: list.filter((o) => o.status === "paused").length,
    };
  }, [data]);

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between gap-3">
        <div className="leading-tight">
          <h1 className="text-xl font-bold tracking-tight">{t("objectsTitle")}</h1>
          <p className="text-[13px] text-muted-foreground">
            {uk ? "квартири, будинки та офіси з грошима і етапами" : "квартиры, дома и офисы с деньгами и этапами"}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus className="size-4" /> <span className="hidden sm:inline">{uk ? "Об'єкт" : "Объект"}</span>
        </Button>
      </div>

      <div className="space-y-2.5">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder={uk ? "Пошук за назвою або замовником…" : "Поиск по названию или заказчику…"}
        />
        <FilterChips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("all"), count: counts.all },
            { value: "active", label: t("objectsFilterActive"), count: counts.active },
            { value: "done", label: t("objectsFilterDone"), count: counts.done },
            { value: "paused", label: t("objectsFilterPaused"), count: counts.paused },
          ]}
        />
      </div>

      {isLoading ? (
        <ListSkeleton rows={3} height="h-40" />
      ) : error ? (
        <ErrorCard message={error.message} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        q || filter !== "all" ? (
          <Empty
            icon={HardHat}
            title={uk ? "Нічого не знайшлось" : "Ничего не нашлось"}
            sub={uk ? "Спробуйте інший запит або скиньте фільтр" : "Попробуйте другой запрос или сбросьте фильтр"}
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
            icon={HardHat}
            title={uk ? "Об'єктів поки немає" : "Объектов пока нет"}
            sub={
              uk
                ? "Об'єкт — це квартира, будинок або офіс. Додайте перший — етапи створяться автоматично."
                : "Объект — это квартира, дом или офис. Добавьте первый — этапы создадутся автоматически."
            }
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" /> {uk ? "Додати об'єкт" : "Добавить объект"}
              </Button>
            }
          />
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((o) => (
            <ObjectCard key={o.id} o={o} />
          ))}
        </div>
      )}

      <ObjectCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(v) => create.mutate(v)}
        pending={create.isPending}
      />
    </div>
  );
}

export function ObjectCreateDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: { name: string; customer: string; address: string }) => void;
  pending?: boolean;
}) {
  const { t, lang } = useI18n();
  const uk = lang === "uk";
  const [name, setName] = React.useState("");
  const [customer, setCustomer] = React.useState("");
  const [address, setAddress] = React.useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="size-5 text-primary" /> {t("objectsNew")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3.5 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="obj-name">{t("objectsName")} *</Label>
            <Input
              id="obj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={uk ? "ЖК Тиха Гавань, кв. 42" : "ЖК Тихая Гавань, кв. 42"}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obj-customer">{t("objectsCustomer")}</Label>
            <Input
              id="obj-customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder={uk ? "Ім'я або «як звертатись»" : "Имя или «как обращаться»"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obj-address">
              {t("objectsAddress")} {uk ? "(необов'язково)" : "(необязательно)"}
            </Label>
            <Input
              id="obj-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={uk ? "Район, вулиця" : "Район, улица"}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {uk
              ? "Етапи будівництва (демонтаж → чорнові → електрика → малярні → фініш) додадуться автоматично."
              : "Этапы стройки (демонтаж → черновые → электрика → малярные → финиш) добавятся автоматически."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!name.trim() || pending}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                customer: customer.trim() || (uk ? "Замовник" : "Заказчик"),
                address: address.trim(),
              })
            }
          >
            {pending ? (uk ? "Створюємо…" : "Создаём…") : uk ? "Створити" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
