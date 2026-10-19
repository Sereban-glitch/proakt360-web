"use client";

// UI-кит «ПрорАКТ 360»: бренд, статусы, прогресс-кольцо, пустые состояния,
// поиск, чипы-фильтры. Всё строится поверх shadcn/ui и токенов бренда.

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { ACT_STATUS, EST_STATUS, OBJECT_STATUS } from "@/lib/format";
import { AlertTriangle, Check, Copy, Ghost, Inbox, Loader2, RotateCcw, Search, X } from "lucide-react";

/* ---------- Бренд ---------- */

export function BrandMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo.svg"
      width={size}
      height={size}
      alt="ПрорАКТ 360"
      className={cn("rounded-xl shadow-sm", className)}
    />
  );
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  const { lang } = useI18n();
  return (
    <span className="flex items-baseline gap-1.5 leading-none select-none">
      <span className="font-bold tracking-tight text-[15px]">ПрорАКТ</span>
      <span className="font-extrabold text-primary tracking-tight text-[15px]">360</span>
      {!compact && (
        <span className="ml-1 hidden sm:inline text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
          {lang === "uk" ? "цифровий виконроб" : "цифровой прораб"}
        </span>
      )}
    </span>
  );
}

export function DemoChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-dashed border-primary/50 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary",
        className,
      )}
    >
      demo
    </span>
  );
}

/* ---------- Статусы ---------- */

const statusTone: Record<string, string> = {
  // сметы
  draft: "bg-muted text-muted-foreground border-transparent",
  sent: "bg-warn-soft text-warn border-warn/30",
  approved: "bg-ok-soft text-ok border-ok/30",
  done: "bg-secondary text-secondary-foreground border-transparent",
  // акты
  paid: "bg-ok-soft text-ok border-ok/30",
  partial: "bg-warn-soft text-warn border-warn/30",
  unpaid: "bg-danger-soft text-danger border-danger/30",
  zero: "bg-muted text-muted-foreground border-transparent",
  // объекты
  active: "bg-ok-soft text-ok border-ok/30",
  paused: "bg-muted text-muted-foreground border-transparent",
  objectDone: "bg-secondary text-secondary-foreground border-transparent",
};

export function StatusBadge({ kind, value }: { kind: "estimate" | "act" | "object"; value: string }) {
  const { lang } = useI18n();
  const uk = lang === "uk";
  let label = value;
  let tone = "draft";
  if (kind === "estimate") {
    const item = EST_STATUS[value];
    label = item ? (uk ? item.labelUk : item.labelRu) : value;
    tone = value;
  } else if (kind === "act") {
    const item = ACT_STATUS[value];
    label = item ? (uk ? item.labelUk : item.labelRu) : value;
    tone = value;
  } else {
    const item = OBJECT_STATUS[value];
    label = item ? (uk ? item.labelUk : item.labelRu) : value;
    tone = value === "active" ? "active" : value === "paused" ? "paused" : "objectDone";
  }
  return (
    <Badge variant="outline" className={cn("px-2 py-0 text-[11px] font-semibold whitespace-nowrap", statusTone[tone])}>
      {label}
    </Badge>
  );
}

export function HiddenBadge({ compact = false }: { compact?: boolean }) {
  const { lang } = useI18n();
  const uk = lang === "uk";
  return (
    <Badge
      variant="outline"
      className="gap-1 border-border bg-muted/60 text-muted-foreground px-1.5 py-0 text-[10px] font-medium"
      title={uk ? "Прихована підготовка — замовник її не бачить, але вона пояснює витрати" : "Скрытая подготовка — заказчик её не видит, но она объясняет, на что уходят деньги"}
    >
      <Ghost className="size-3" />
      {!compact && (uk ? "прихована" : "скрытая")}
    </Badge>
  );
}

/* ---------- Прогресс ---------- */

export function ProgressRing({
  value,
  size = 96,
  stroke = 9,
  label,
  sub,
  className,
}: {
  value: number; // 0..100
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-primary transition-all duration-700"
          style={{ strokeDasharray: c, strokeDashoffset: c * (1 - v / 100) }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-lg font-bold leading-none">{label ?? `${Math.round(v)}%`}</span>
        {sub && <span className="mt-0.5 text-[10px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

export function MoneyBar({ value, tone = "ok" }: { value: number; tone?: "ok" | "primary" | "warn" | "danger" }) {
  return (
    <Progress
      value={Math.max(0, Math.min(100, value * 100))}
      className={cn("h-1.5", tone === "ok" && "[&>div]:bg-ok", tone === "primary" && "[&>div]:bg-primary", tone === "warn" && "[&>div]:bg-warn", tone === "danger" && "[&>div]:bg-danger")}
    />
  );
}

/* ---------- Пустые состояния и ошибки ---------- */

export function Empty({
  icon: Icon = Inbox,
  title,
  sub,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  sub?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center", className)}>
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="font-semibold">{title}</p>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-6 py-10 text-center">
      <AlertTriangle className="size-8 text-danger" />
      <div className="space-y-1">
        <p className="font-semibold">Данные не загрузились</p>
        <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="size-4" /> Попробовать снова
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 4, height = "h-24" }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("w-full rounded-2xl", height)} />
      ))}
    </div>
  );
}

export function ButtonSpinner() {
  return <Loader2 className="size-4 animate-spin" />;
}

/* ---------- Поиск и фильтры ---------- */

export function SearchInput({
  value,
  onChange,
  placeholder = "Поиск…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8"
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Очистить поиск"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn("scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "pressable shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
            value === o.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="num ml-1 opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Разное ---------- */

export function SectionHead({
  title,
  action,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

export function CopyButton({ text, label = "Скопировать", size = "sm" }: { text: string; label?: string; size?: "sm" | "default" }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="outline"
      size={size}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
      {copied ? "Скопировано" : label}
    </Button>
  );
}

export function PhotoThumb({
  id,
  caption,
  date,
  className,
  onClick,
}: {
  id: number;
  caption?: string;
  date?: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <figure
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-muted",
        onClick && "pressable cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      <img src={`/api/photo/${id}`} alt={caption || "Фото скрытых работ (демо)"} className="aspect-[4/3] w-full object-cover" loading="lazy" />
      {(caption || date) && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-left">
          {caption && <span className="block truncate text-[11px] font-medium text-white">{caption}</span>}
          {date && <span className="block text-[10px] text-white/70">{date}</span>}
        </figcaption>
      )}
    </figure>
  );
}
