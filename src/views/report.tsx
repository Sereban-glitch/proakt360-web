"use client";

// Отчёт: сводка по объектам, долги по актам, «требует внимания».

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { dateShort, money, moneyShort, plural } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { navigate } from "@/lib/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Empty, ErrorCard, ListSkeleton, ProgressRing, SectionHead, StatusBadge } from "@/components/kit";
import { AlertTriangle, ChevronRight, LayoutGrid, Wallet } from "lucide-react";

export function ReportView() {
  const { t, lang } = useI18n();
  const uk = lang === "uk";
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });
  const objects = useQuery({ queryKey: ["objects"], queryFn: api.objects });

  if (dashboard.isLoading || objects.isLoading) return <ListSkeleton rows={4} height="h-28" />;
  if (dashboard.error || !dashboard.data)
    return (
      <ErrorCard
        message={dashboard.error?.message ?? (uk ? "Немає даних" : "Нет данных")}
        onRetry={() => dashboard.refetch()}
      />
    );

  const d = dashboard.data;
  const debt = d.debtTotal;

  return (
    <div className="space-y-5 fade-in">
      <div className="leading-tight">
        <h1 className="text-xl font-bold tracking-tight">{t("reportTitle")}</h1>
        <p className="text-[13px] text-muted-foreground">
          {uk ? "борги, увага і гроші за об'єктами" : "долги, внимание и деньги по объектам"}
        </p>
      </div>

      {/* Сводка */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card sm:col-span-2">
          <CardContent className="flex items-center gap-4 p-5">
            <ProgressRing
              value={d.stats.total > 0 ? (d.stats.paid / d.stats.total) * 100 : 0}
              size={88}
              sub={uk ? "сплачено" : "оплачено"}
            />
            <div className="min-w-0 space-y-1 leading-tight">
              <p className="num text-2xl font-extrabold">{money(d.stats.total)}</p>
              <p className="text-xs text-muted-foreground">
                {uk
                  ? `виконано за ${d.stats.acts} ${plural(d.stats.acts, "актом", "актами", "актами")}`
                  : `выполнено по ${d.stats.acts} ${plural(d.stats.acts, "акту", "актам", "актам")}`}
              </p>
              <p className="text-xs">
                {uk ? "сплачено" : "оплачено"} <b className="num">{money(d.stats.paid)}</b>
                {debt > 0.01 ? (
                  <>
                    {" · "}{uk ? "чекає оплати" : "ждёт оплаты"} <b className="num text-danger">{money(debt)}</b>
                  </>
                ) : (
                  <span className="text-ok"> · {uk ? "боргів немає" : "долгов нет"}</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2.5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Портфель</p>
            {[
              { label: uk ? "об'єктів" : "объектов", value: d.stats.objects },
              { label: uk ? "актів" : "актов", value: d.stats.acts },
              { label: uk ? "фото" : "фото", value: d.stats.photos },
              { label: uk ? "позицій прайсу" : "позиций прайса", value: d.priceCount },
            ].map((row) => (
              <div key={row.label} className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">{row.label}</span>
                <span className="num text-base font-bold">{row.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Требует внимания */}
      {d.stats.zeroActs > 0 && (
        <button
          type="button"
          onClick={() => navigate("#/acts")}
          className="pressable flex w-full items-center gap-3 rounded-2xl border border-warn/35 bg-warn-soft px-4 py-3.5 text-left"
        >
          <AlertTriangle className="size-5 shrink-0 text-warn" />
          <span className="min-w-0 flex-1 leading-tight">
            <b className="block text-sm font-semibold">
              {d.stats.zeroActs}{" "}
              {uk
                ? plural(d.stats.zeroActs, "акт із сумою 0", "акти із сумою 0", "актів із сумою 0")
                : plural(d.stats.zeroActs, "акт с суммой 0", "акта с суммой 0", "актов с суммой 0")}
            </b>
            <span className="block text-xs text-muted-foreground">
              {uk ? "роботи зроблені, гроші не виставлені" : "работы сделаны, деньги не выставлены"}
            </span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      )}

      {/* Долги по актам */}
      <section className="space-y-2.5">
        <SectionHead title={`${t("reportWaiting")} (${d.debts.length})`} />
        {d.debts.length === 0 ? (
          <Empty
            className="py-8"
            icon={Wallet}
            title={uk ? "Боргів немає" : "Долгов нет"}
            sub={uk ? "Усі акти закриті — гроші під контролем" : "Все акты закрыты — деньги под контролем"}
          />
        ) : (
          <Card>
            <CardContent className="divide-y divide-border/70 p-0">
              {d.debts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => navigate(`#/acts/${a.id}`)}
                  className="pressable flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-sm font-semibold">
                      {t("actNumber")}{a.actNo} · {a.objectName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {dateShort(a.date)} · {uk ? "сплачено" : "оплачено"} {moneyShort(a.paid)} {uk ? "з" : "из"} {moneyShort(a.total)}
                    </p>
                  </div>
                  <span className="num shrink-0 text-sm font-bold text-danger">
                    −{moneyShort(a.total - a.paid)}
                  </span>
                  <StatusBadge kind="act" value={a.status} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* По объектам */}
      <section className="space-y-2.5">
        <SectionHead title={t("reportByObjects")} />
        {(objects.data ?? []).length === 0 ? (
          <Empty
            icon={LayoutGrid}
            title={uk ? "Немає об'єктів" : "Нет объектов"}
            sub={uk ? "Додайте об'єкт — тут з'явиться зведення" : "Добавьте объект — здесь появится сводка"}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(objects.data ?? []).map((o) => (
              <Card
                key={o.id}
                className="pressable cursor-pointer border-border transition-colors hover:border-primary/40"
                onClick={() => navigate(`#/objects/${o.id}`)}
              >
                <CardContent className="space-y-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-bold">{o.name}</p>
                    <StatusBadge kind="object" value={o.status} />
                  </div>
                  <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                    <span className="num">{uk ? "виконано" : "выполнено"} {moneyShort(o.total)}</span>
                    <span className="num">
                      {uk ? "сплачено" : "оплачено"} {Math.round((o.paid / (o.total || 1)) * 100)}%
                    </span>
                  </div>
                  <Progress value={o.total > 0 ? (o.paid / o.total) * 100 : 0} className="h-1.5 [&>div]:bg-ok" />
                  {o.debt > 0.01 ? (
                    <p className="text-xs">
                      {uk ? "борг" : "долг"} <b className="num text-danger">{money(o.debt)}</b>
                    </p>
                  ) : (
                    <p className="text-xs text-ok">{uk ? "розрахунки закриті" : "расчёты закрыты"}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
