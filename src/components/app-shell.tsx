"use client";

// Каркас приложения «ПрорАКТ 360»:
// desktop — левый сайдбар; mobile — шапка + нижняя навигация + меню «Ещё».
// Внизу всегда демо-футер (sticky): прототип не связан с реальным сервером бота.

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { navigate } from "@/lib/router";
import { useI18n } from "@/lib/i18n";
import { BrandMark, BrandWordmark, DemoChip } from "@/components/kit";
import {
  ClipboardList,
  FileSpreadsheet,
  HardHat,
  Home,
  LayoutGrid,
  type LucideIcon,
  Megaphone,
  Menu,
  Moon,
  PiggyBank,
  Layers,
  Settings,
  Sun,
  User,
  Wrench,
} from "lucide-react";
import { useTheme } from "next-themes";

type NavItem = { to: string; label: string; icon: LucideIcon; note?: string };
type NavGroup = { title?: string; items: NavItem[] };

function useNav(): NavGroup[] {
  const { t, lang } = useI18n();
  return [
    {
      title: t("navWork"),
      items: [
        { to: "#/", label: t("navDashboard"), icon: Home },
        { to: "#/objects", label: t("navObjects"), icon: HardHat },
        { to: "#/estimates", label: t("navEstimates"), icon: FileSpreadsheet },
        { to: "#/acts", label: t("navActs"), icon: ClipboardList },
      ],
    },
    {
      title: t("navTools"),
      items: [
        { to: "#/price", label: t("navPrice"), icon: PiggyBank, note: t("navPriceSub") },
        { to: "#/templates", label: t("navTemplates"), icon: Layers, note: t("navTemplatesSub") },
        { to: "#/report", label: t("navReport"), icon: LayoutGrid, note: t("navReportSub") },
        { to: "#/settings", label: t("navSettings"), icon: Settings, note: t("navSettingsSub") },
      ],
    },
    {
      title: lang === "uk" ? "Клієнт" : "Клиент",
      items: [
        { to: "#/client/demo-rivija-42", label: t("navClient"), icon: User, note: t("navClientSub") },
        { to: "#/showcase", label: t("navShowcase"), icon: Megaphone, note: t("navShowcaseSub") },
      ],
    },
  ];
}

function isActive(current: string, to: string): boolean {
  const cur = current.replace(/^#\/?/, "");
  const target = to.replace(/^#\/?/, "");
  if (target === "") return cur === "";
  return cur === target || cur.startsWith(target + "/");
}

function LangToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <Button
      variant="outline"
      size="icon"
      className={`${compact ? "size-8" : "size-9"} no-print font-bold text-[11px]`}
      aria-label="Мова / язык"
      onClick={() => {
        const next = lang === "ru" ? "uk" : "ru";
        setLang(next);
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang: next }),
        }).catch(() => undefined);
      }}
    >
      {lang === "ru" ? "RU" : "UK"}
    </Button>
  );
}

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="outline"
      size="icon"
      className={`${compact ? "size-8" : "size-9"} no-print`}
      aria-label="Переключить тему"
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {mounted && (dark ? <Sun className="size-4" /> : <Moon className="size-4" />)}
    </Button>
  );
}

function SidebarNav({ current, onNav }: { current: string; onNav?: () => void }) {
  const NAV = useNav();
  return (
    <nav className="flex flex-col gap-5" aria-label="Основная навигация">
      {NAV.map((group) => (
        <div key={group.title ?? "root"} className="space-y-1">
          {group.title && (
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {group.title}
            </p>
          )}
          {group.items.map((item) => {
            const active = isActive(current, item.to);
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => {
                  navigate(item.to);
                  onNav?.();
                }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "pressable flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <item.icon className={cn("size-4 shrink-0", active ? "" : "opacity-80")} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.note && !active && (
                  <span className="hidden text-[10px] text-muted-foreground/70 xl:block">{item.note}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function AppFooter({ className }: { className?: string }) {
  const { lang } = useI18n();
  return (
    <footer className={cn("mt-auto border-t border-border/70 px-4 py-3", className)}>
      <p className="mx-auto max-w-5xl text-center text-[11px] leading-relaxed text-muted-foreground">
        <b className="text-foreground/80">«ПрорАКТ 360»</b> · {lang === "uk" ? "кабінет будівельника та замовника" : "кабинет строителя и заказчика"} · @ProAktSmetaBot
      </p>
    </footer>
  );
}

export function AppShell({
  current,
  children,
  tabBar = true,
}: {
  current: string;
  children: React.ReactNode;
  tabBar?: boolean;
}) {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const activeRoot = current.split("/")[0] ?? "";
  const { t, lang } = useI18n();

  const tabItems = [
    { to: "#/", label: t("navDashboard"), icon: Home, id: "" },
    { to: "#/objects", label: t("navObjects"), icon: HardHat, id: "objects" },
    { to: "#/estimates", label: t("navEstimates"), icon: FileSpreadsheet, id: "estimates" },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <div className="bg-glow flex min-h-dvh w-full max-w-full flex-col overflow-x-hidden bg-background">
        {/* ===== Мобильная шапка ===== */}
        <header className="glass sticky top-0 z-40 flex items-center gap-2.5 border-b border-border/70 px-4 py-2.5 lg:hidden">
          <BrandMark size={30} />
          <div className="min-w-0 flex-1 leading-tight">
            <BrandWordmark />
          </div>
          <ThemeToggle compact />
          <LangToggle compact />
          <Button variant="outline" size="icon" className="size-8" aria-label="Меню" onClick={() => setMoreOpen(true)}>
            <Menu className="size-4" />
          </Button>
        </header>

        <div className="mx-auto flex w-full max-w-[1440px] flex-1 overflow-x-hidden">
          {/* ===== Сайдбар (desktop) ===== */}
          <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col justify-between border-r border-border/70 bg-sidebar px-4 py-5 lg:flex print:hidden">
            <div className="space-y-6">
              <button type="button" className="flex items-center gap-2.5 px-1 text-left" onClick={() => navigate("#/")}>
                <BrandMark size={38} />
                <div className="leading-tight">
                  <BrandWordmark />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {lang === "uk" ? "кошториси · об'єкти · оплати" : "сметы · объекты · оплаты"}
                  </p>
                </div>
              </button>
              <SidebarNav current={current} />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card px-3 py-2">
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-foreground">ПрорАКТ 360</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{lang === "uk" ? "робоча база" : "рабочая база"}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <LangToggle compact />
                  <ThemeToggle compact />
                </div>
              </div>
            </div>
          </aside>

          {/* ===== Контент ===== */}
          <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
            <main className="mx-auto w-full max-w-5xl flex-1 overflow-x-hidden px-3.5 pb-24 pt-4 sm:px-6 sm:pt-6 lg:pb-8">
              {children}
            </main>
            <AppFooter className="hidden lg:block" />
          </div>
        </div>

        {/* ===== Нижняя навигация (mobile) ===== */}
        {tabBar && (
          <nav
            className="glass fixed inset-x-0 bottom-0 z-40 flex border-t border-border/70 pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
            aria-label="Нижняя навигация"
          >
            {tabItems.map((t) => {
              const active = activeRoot === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navigate(t.to)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <t.icon className="size-5" />
                  {t.label}
                </button>
              );
            })}
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                    ["acts", "price", "templates", "report", "settings", "client", "showcase"].includes(activeRoot)
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  <Wrench className="size-5" />
                  {lang === "uk" ? "Ще" : "Ещё"}
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="pb-[calc(env(safe-area-inset-bottom)+16px)]">
                <SheetHeader className="pb-1">
                  <SheetTitle className="flex items-center gap-2 text-left">
                    <BrandMark size={26} /> {lang === "uk" ? "Усі розділи" : "Все разделы"}
                  </SheetTitle>
                </SheetHeader>
                <div className="px-1">
                  <SidebarNav current={current} onNav={() => setMoreOpen(false)} />
                  <p className="mt-4 px-3 text-[11px] leading-relaxed text-muted-foreground">
                    {lang === "uk"
                      ? "Основні розділи завжди внизу екрана, інші — тут, щоб не перевантажувати робочий стіл."
                      : "Основные разделы всегда внизу экрана, остальные — здесь, чтобы не перегружать рабочий стол."}
                  </p>
                </div>
              </SheetContent>
            </Sheet>
          </nav>
        )}

        {/* Футер для мобильных — прямо над таб-баром, в потоке страницы */}
        <AppFooter className="pb-[calc(env(safe-area-inset-bottom)+64px)] lg:hidden" />
      </div>
    </TooltipProvider>
  );
}

export { AppFooter as DemoFooter, AppFooter, SidebarNav, ThemeToggle, LangToggle };
