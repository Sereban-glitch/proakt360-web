"use client";

// Акты: поиск (по объекту и номеру), фильтры по оплате, переходы к объекту.

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { dateShort, money, moneyShort, plural } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { navigate, useRoute } from "@/lib/router";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, ErrorCard, FilterChips, ListSkeleton, SearchInput, StatusBadge } from "@/components/kit";
import { ChevronRight, ClipboardList, HardHat } from "lucide-react";

type Filter = "all" | "unpaid" | "partial" | "paid";

export function ActsView() {
  const route = useRoute();
  const { t, lang } = useI18n();
  const uk = lang === "uk";
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["acts"],
    queryFn: () => api.acts(),
  });

  const filtered = React.useMemo(() => {
    const list = data ?? [];
    return list.filter((a) => {
      if (filter !== "all" && a.status !== filter) return false;
      if (q.trim()) {
        const s = q.trim().toLowerCase();
        return a.objectName.toLowerCase().includes(s) || String(a.actNo).includes(s);
      }
      return true;
    });
  }, [data, filter, q]);

  const counts = React.useMemo(() => {
    const list = data ?? [];
    return {
      all: list.length,
      unpaid: list.filter((a) => a.status === "unpaid").length,
      partial: list.filter((a) => a.status === "partial").length,
      paid: list.filter((a) => a.status === "paid").length,
    };
  }, [data]);

  return (
    <div className="space-y-4 fade-in">
      <div className="leading-tight">
        <h1 className="text-xl font-bold tracking-tight">{t("actsTitle")}</h1>
        <p className="text-[13px] text-muted-foreground">
          {counts.all}{" "}
          {uk ? plural(counts.all, "акт", "акти", "актів") : plural(counts.all, "акт", "акта", "актов")} ·{" "}
          {uk ? "що зроблено і що оплачено" : "что сделано и что оплачено"}
        </p>
      </div>

      <div className="space-y-2.5">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder={uk ? "Пошук за об'єктом або номером акта…" : "Поиск по объекту или номеру акта…"}
        />
        <FilterChips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("all"), count: counts.all },
            { value: "unpaid", label: t("reportWaiting"), count: counts.unpaid },
            { value: "partial", label: t("actStatusPartial"), count: counts.partial },
            { value: "paid", label: uk ? "Оплачені" : "Оплачены", count: counts.paid },
          ]}
        />
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} height="h-16" />
      ) : error ? (
        <ErrorCard message={error.message} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        q || filter !== "all" ? (
          <Empty
            icon={ClipboardList}
            title={uk ? "Нічого не знайшлось" : "Ничего не нашлось"}
            sub={uk ? "Змініть запит або фільтр" : "Смените запрос или фильтр"}
            action={
              <ButtonReset
                uk={uk}
                onClick={() => {
                  setQ("");
                  setFilter("all");
                }}
              />
            }
          />
        ) : (
          <Empty
            icon={ClipboardList}
            title={uk ? "Актів ще немає" : "Актов ещё нет"}
            sub={
              uk
                ? "Акт створюється з кошторису: позначте виконані рядки — отримаєте документ з тими самими цінами."
                : "Акт создаётся из сметы: отметьте выполненные строки — получите документ с теми же ценами."
            }
          />
        )
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/70 p-0">
            {filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`#/acts/${a.id}`)}
                className="pressable flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-semibold">
                    {t("actNumber")}{a.actNo}
                    <span className="text-muted-foreground"> · {a.objectName}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {dateShort(a.date)}
                    {a.photos > 0 && ` · ${a.photos} ${plural(a.photos, "фото", "фото", "фото")}`}
                    {a.status !== "paid" && a.paid > 0 && ` · ${uk ? "сплачено" : "оплачено"} ${moneyShort(a.paid)}`}
                  </p>
                </div>
                <div className="shrink-0 text-right leading-tight">
                  <p className="num text-sm font-bold">{money(a.total)}</p>
                  {a.status !== "paid" && a.total > a.paid && (
                    <p className="num text-[11px] text-danger">−{moneyShort(a.total - a.paid)}</p>
                  )}
                </div>
                <StatusBadge kind="act" value={a.status} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ButtonReset({ onClick, uk }: { onClick: () => void; uk: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border px-3 py-1 text-[13px] text-muted-foreground hover:text-foreground"
    >
      {uk ? "Скинути" : "Сбросить"}
    </button>
  );
}
