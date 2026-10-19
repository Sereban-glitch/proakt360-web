"use client";

// Рабочий стол мастера: главное число — «к получению», быстрые действия,
// сметы в работе и последние акты. Ничего лишнего не ищем по экрану.

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { dateShort, money, moneyShort, plural } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { navigate } from "@/lib/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BrandMark,
  Empty,
  ErrorCard,
  ListSkeleton,
  ProgressRing,
  SectionHead,
  StatusBadge,
} from "@/components/kit";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  HardHat,
  PiggyBank,
  Plus,
  User,
  Wallet,
} from "lucide-react";

function QuickAction({
  title,
  note,
  icon: Icon,
  primary,
  onClick,
}: {
  title: string;
  note: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? "pressable flex w-full items-center gap-3 rounded-2xl bg-primary px-4 py-3.5 text-left text-primary-foreground shadow-lg shadow-primary/25"
          : "pressable flex w-full items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3 text-left hover:border-primary/40"
      }
    >
      <Icon className={primary ? "size-6 shrink-0" : "size-5 shrink-0 text-primary"} />
      <span className="min-w-0 flex-1 leading-tight">
        <b className={primary ? "block truncate text-[15px] font-bold" : "block truncate text-sm font-semibold"}>
          {title}
        </b>
        <span
          className={
            primary
              ? "block truncate text-xs text-primary-foreground/75"
              : "block truncate text-[11px] text-muted-foreground"
          }
        >
          {note}
        </span>
      </span>
      <ChevronRight className={primary ? "size-5 opacity-70" : "size-4 text-muted-foreground"} />
    </button>
  );
}

function MiniStat({
  value,
  label,
  onClick,
}: {
  value: string | number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable flex min-w-0 flex-col items-center gap-0.5 rounded-xl border border-border bg-card px-1.5 py-2 hover:border-primary/40"
    >
      <span className="num text-base sm:text-lg font-bold leading-none">{value}</span>
      <span className="max-w-full truncate text-[10px] text-muted-foreground">{label}</span>
    </button>
  );
}

export function DashboardView() {
  const { t, lang } = useI18n();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard,
  });

  const objects = useQuery({ queryKey: ["objects"], queryFn: api.objects });

  const uk = lang === "uk";

  if (isLoading) return <ListSkeleton rows={5} height="h-28" />;
  if (error || !data)
    return <ErrorCard message={error?.message ?? (uk ? "Немає даних" : "Нет данных")} onRetry={() => refetch()} />;

  const debt = data.debtTotal;
  const paidRatio = data.stats.total > 0 ? data.stats.paid / data.stats.total : 0;
  const hasObjects = data.stats.objects > 0;

  return (
    <div className="space-y-5 fade-in">
      {/* Приветствие */}
      <div className="flex items-center gap-3">
        <BrandMark size={44} className="lg:hidden" />
        <div className="leading-tight">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("dashToday")}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {data.stats.objects > 0
              ? uk
                ? `${data.stats.objects} ${plural(data.stats.objects, "об'єкт", "об'єкти", "об'єктів")} в роботі · ${data.stats.acts} ${plural(data.stats.acts, "акт", "акти", "актів")}`
                : `${data.stats.objects} ${plural(data.stats.objects, "объект", "объекта", "объектов")} в работе · ${data.stats.acts} ${plural(data.stats.acts, "акт", "акта", "актов")}`
              : uk
                ? "Почніть з об'єкта — далі застосунок підкаже"
                : "Начните с объекта — дальше приложение подскажет"}
          </p>
        </div>
      </div>

      {/* Быстрые действия */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1.4fr_1fr_1fr]">
        <QuickAction
          primary
          title={hasObjects ? t("dashNewEstimate") : uk ? "Додати об'єкт" : "Добавить объект"}
          note={
            hasObjects
              ? t("dashNewEstimateSub")
              : uk
                ? "без нього не буде кошторисів і актів"
                : "без него не будет смет и актов"
          }
          icon={hasObjects ? FileSpreadsheet : HardHat}
          onClick={() => navigate(hasObjects ? "#/estimates?new=1" : "#/objects?new=1")}
        />
        <QuickAction
          title={t("objectsTitle")}
          note={
            uk
              ? `${data.stats.objects} ${plural(data.stats.objects, "об'єкт", "об'єкти", "об'єктів")}`
              : `${data.stats.objects} ${plural(data.stats.objects, "объект", "объекта", "объектов")}`
          }
          icon={HardHat}
          onClick={() => navigate("#/objects")}
        />
        <QuickAction
          title={t("navPrice")}
          note={
            uk
              ? `${data.priceCount} ${plural(data.priceCount, "позиція", "позиції", "позицій")}`
              : `${data.priceCount} ${plural(data.priceCount, "позиция", "позиции", "позиций")}`
          }
          icon={PiggyBank}
          onClick={() => navigate("#/price")}
        />
      </div>

      {/* Деньги: главное число — то, что ещё нужно получить */}
      <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/12 via-card to-card">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <ProgressRing value={paidRatio * 100} size={92} label={`${Math.round(paidRatio * 100)}%`} sub={uk ? "сплачено" : "оплачено"} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {debt > 0.01 ? t("dashToReceive") : uk ? "Оплати" : "Оплаты"}
            </p>
            <p className="num text-3xl font-extrabold tracking-tight">
              {debt > 0.01 ? money(debt) : uk ? "Усе сплачено" : "Всё оплачено"}
            </p>
            <p className="text-[13px] text-muted-foreground">
              {debt > 0.01
                ? uk
                  ? `${data.stats.unpaidActs} ${plural(data.stats.unpaidActs, "акт чекає", "акти чекають", "актів чекають")} оплати`
                  : `${data.stats.unpaidActs} ${plural(data.stats.unpaidActs, "акт ждёт", "акта ждут", "актов ждут")} оплаты`
                : uk
                  ? "за закритими актами заборгованості немає"
                  : "по закрытым актам задолженности нет"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => navigate("#/report")}
          >
            <Wallet className="size-4" /> {t("reportTitle")}
          </Button>
        </CardContent>
      </Card>

      {/* Мини-статы */}
      <div className="grid grid-cols-4 gap-2">
        <MiniStat value={data.stats.objects} label={uk ? "об'єкти" : "объекта"} onClick={() => navigate("#/objects")} />
        <MiniStat
          value={data.activeEstimates.length}
          label={uk ? "кошториси" : "сметы"}
          onClick={() => navigate("#/estimates")}
        />
        <MiniStat value={data.stats.acts} label={uk ? "акти" : "акта"} onClick={() => navigate("#/acts")} />
        <MiniStat value={data.stats.photos} label="фото" onClick={() => navigate("#/objects")} />
      </div>

      {/* Требует внимания */}
      {(debt > 0.01 || data.stats.zeroActs > 0) && (
        <button
          type="button"
          onClick={() => navigate("#/report")}
          className="pressable flex w-full items-center gap-3 rounded-2xl border border-warn/35 bg-warn-soft px-4 py-3.5 text-left"
        >
          <AlertTriangle className="size-5 shrink-0 text-warn" />
          <span className="min-w-0 flex-1 leading-tight">
            <b className="block text-sm font-semibold">
              {debt > 0.01
                ? `${t("dashRemind")} ${moneyShort(debt)} ${t("uah")}`
                : uk
                  ? "Є акт без суми"
                  : "Есть акт без суммы"}
            </b>
            <span className="block truncate text-xs text-muted-foreground">
              {debt > 0.01 && data.stats.zeroActs > 0
                ? uk
                  ? `і ще ${data.stats.zeroActs} ${plural(data.stats.zeroActs, "акт", "акти", "актів")} без суми`
                  : `и ещё ${data.stats.zeroActs} ${plural(data.stats.zeroActs, "акт", "акта", "актов")} без суммы`
                : debt > 0.01
                  ? t("dashRemindSub")
                  : uk
                    ? "роботи є, замовнику нічого виставити"
                    : "работы есть, заказчику нечего выставить"}
            </span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      )}

      {/* Сметы в работе */}
      {data.activeEstimates.length > 0 && (
        <section className="space-y-2.5">
          <SectionHead
            title={t("dashEstimatesInWork")}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate("#/estimates")}>
                {uk ? "Усі кошториси" : "Все сметы"} <ArrowRight className="size-3.5" />
              </Button>
            }
          />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {data.activeEstimates.slice(0, 2).map((est) => (
              <Card
                key={est.id}
                className="pressable cursor-pointer border-border transition-colors hover:border-primary/40"
                onClick={() => navigate(`#/estimates/${est.id}`)}
              >
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{est.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{est.objectName}</p>
                    </div>
                    <StatusBadge kind="estimate" value={est.status} />
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="num text-lg font-bold">{money(est.total)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {est.progress > 0
                        ? `${uk ? "закрито" : "закрыто"} ${Math.round(est.progress * 100)}%`
                        : uk
                          ? "роботи не починались"
                          : "работы не начаты"}
                    </span>
                  </div>
                  <Progress value={est.progress * 100} className="h-1.5 [&>div]:bg-primary" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Последние акты */}
      <section className="space-y-2.5">
        <SectionHead
          title={t("dashRecentActs")}
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate("#/acts")}>
              {uk ? "Усі акти" : "Все акты"} <ArrowRight className="size-3.5" />
            </Button>
          }
        />
        <Card>
          <CardContent className="divide-y divide-border/70 p-0">
            {data.recentActs.length === 0 ? (
              <Empty
                className="m-4 border-0 py-6"
                icon={ClipboardList}
                title={uk ? "Актів ще немає" : "Актов ещё нет"}
                sub={
                  uk
                    ? "Акт створюється з кошторису — позначте виконані рядки"
                    : "Акт создаётся из сметы — отметьте выполненные строки"
                }
                action={
                  <Button size="sm" onClick={() => navigate("#/estimates")}>
                    <Plus className="size-4" /> {uk ? "До кошторисів" : "К сметам"}
                  </Button>
                }
              />
            ) : (
              data.recentActs.map((a) => (
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
                  <span className="num text-sm font-bold">{money(a.total)}</span>
                  <StatusBadge kind="act" value={a.status} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {/* Подсказка про кабинет заказчика */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <User className="size-5 text-primary" />
          </div>
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted-foreground">
            {uk
              ? "Покажіть замовнику його "
              : "Покажите заказчику его "}
            <b className="text-foreground">{uk ? "кабінет" : "кабинет"}</b>
            {uk
              ? ": етапи, фото прихованих робіт і погодження кошторису — за одним посиланням, без реєстрації."
              : ": этапы, фото скрытых работ и согласование сметы — по одной ссылке, без регистрации."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const firstWithToken = objects.data?.find((o) => o.clientToken);
              if (firstWithToken) {
                navigate(`#/client/${firstWithToken.clientToken}`);
              } else {
                navigate("#/objects");
              }
            }}
          >
            {uk ? "Відкрити кабінет замовника" : "Открыть кабинет заказчика"}
          </Button>
        </CardContent>
      </Card>

      {objects.data && objects.data.length === 0 && (
        <Empty
          icon={HardHat}
          title={uk ? "Жодного об'єкта" : "Ни одного объекта"}
          sub={
            uk
              ? "Об'єкт — це квартира, будинок або офіс. З нього починаються кошториси і акти."
              : "Объект — это квартира, дом или офис. С него начинаются сметы и акты."
          }
          action={
            <Button onClick={() => navigate("#/objects?new=1")}>
              <Plus className="size-4" /> {uk ? "Додати об'єкт" : "Добавить объект"}
            </Button>
          }
        />
      )}
    </div>
  );
}
