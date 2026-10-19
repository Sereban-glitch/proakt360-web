"use client";

// Корень SPA «ПрорАКТ 360» v2: провайдеры, вход мастера (auth-гейт),
// маршрутизация по hash. Прямая загрузка «/» нормализуется в «#/» —
// refresh и прямые ссылки работают без «пустого» экрана.

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { motion } from "framer-motion";
import { useRoute, navigate } from "@/lib/router";
import { useI18n } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/views/dashboard";
import { ObjectsView } from "@/views/objects";
import { ObjectDetailView } from "@/views/object-detail";
import { EstimatesView } from "@/views/estimates";
import { EstimateDetailView } from "@/views/estimate-detail";
import { ActsView } from "@/views/acts";
import { ActDetailView } from "@/views/act-detail";
import { PriceView } from "@/views/price";
import { TemplatesView } from "@/views/templates";
import { ReportView } from "@/views/report";
import { SettingsView } from "@/views/settings";
import { LoginView } from "@/views/login";
import { ClientCabinetView } from "@/views/client";
import { ShowcaseView } from "@/views/showcase";
import { Empty, ListSkeleton, BrandMark } from "@/components/kit";
import { Button } from "@/components/ui/button";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Screen({ routeKey, children }: { routeKey: string; children: React.ReactNode }) {
  return (
    <motion.div
      key={routeKey}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/** Нормализация: пустой hash «» или служебные параметры Telegram → «#/». */
function useNormalizedHash() {
  React.useEffect(() => {
    const curHash = window.location.hash || "";
    if (
      !curHash ||
      curHash === "#" ||
      curHash.includes("tgWebAppData=") ||
      curHash.startsWith("#tgWebApp") ||
      curHash.includes("query_id=")
    ) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search + "#/");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }, []);
}

function View() {
  const route = useRoute();
  useNormalizedHash();
  const [a, b] = route.segments;
  const id = Number(b);
  const { lang } = useI18n();

  // --- отдельные «публичные» экраны без шелла мастера ---
  if (a === "client" || a === "c") {
    return <ClientCabinetView token={b ?? ""} />;
  }
  if (a === "showcase") {
    return <ShowcaseView />;
  }

  // --- кабинет мастера ---
  let content: React.ReactNode;
  const isTgParam =
    !a ||
    a === "" ||
    a.startsWith("tgWebApp") ||
    a.includes("query_id=") ||
    a.includes("tgWebAppData") ||
    route.path.includes("tgWebApp");

  if (isTgParam) content = <DashboardView />;
  else if (a === "objects") content = b ? <ObjectDetailView id={id} /> : <ObjectsView />;
  else if (a === "estimates") content = b ? <EstimateDetailView id={id} /> : <EstimatesView />;
  else if (a === "acts") content = b ? <ActDetailView id={id} /> : <ActsView />;
  else if (a === "price") content = <PriceView />;
  else if (a === "templates") content = <TemplatesView />;
  else if (a === "report") content = <ReportView />;
  else if (a === "settings") content = <SettingsView />;
  else
    content = (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Empty
          title={lang === "uk" ? "Екран не знайдено" : "Экран не найден"}
          sub={lang === "uk" ? "Маршрут не існує. Поверніться на робочий стіл." : "Маршрут не существует. Вернитесь на рабочий стол."}
        />
        <Button className="mt-4" onClick={() => navigate("#/")}>
          {lang === "uk" ? "На робочий стіл" : "На рабочий стол"}
        </Button>
      </div>
    );

  return (
    <AppShell current={route.path}>
      <Screen routeKey={route.path}>{content}</Screen>
    </AppShell>
  );
}

/** Экран первичной настройки: сервер без пароля и без демо-режима (fail-closed). */
function SetupGate({ onRetry }: { onRetry: () => void }) {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col items-center gap-3 mb-6 text-center">
          <BrandMark size={52} />
          <h1 className="text-lg font-semibold text-foreground">{t("setupTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("setupSub")}</p>
        </div>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3 items-start">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">1</span>
            <code className="text-xs font-mono break-all rounded bg-muted px-2 py-1.5">npm run setup:password</code>
          </li>
          <li className="flex gap-3 items-start">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">2</span>
            <span className="text-muted-foreground text-xs leading-relaxed">{t("setupStep2")}</span>
          </li>
        </ol>
        <Button className="w-full mt-6 h-11" onClick={onRetry}>
          {t("setupRetry")}
        </Button>
        <p className="mt-4 text-[11px] text-muted-foreground text-center leading-relaxed">{t("setupHint")}</p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={lang === "ru" ? "border-primary" : ""}
            onClick={() => setLang("ru")}
          >
            Русский
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={lang === "uk" ? "border-primary" : ""}
            onClick={() => setLang("uk")}
          >
            Українська
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Auth-гейт: настройка → вход → приложение. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.me(),
    staleTime: 5_000,
  });
  const { setLang } = useI18n();
  const langRef = React.useRef("");

  // язык по умолчанию подтягиваем из настроек сервера (один раз)
  React.useEffect(() => {
    if (data?.lang && langRef.current === "") {
      langRef.current = data.lang;
      const stored = window.localStorage.getItem("proakt360-lang");
      if (!stored) setLang(data.lang);
    }
  }, [data?.lang, setLang]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <BrandMark size={44} />
        <ListSkeleton rows={3} />
      </div>
    );
  }
  if (error) {
    const msg = error instanceof ApiError ? error.message : "Сервер недоступен";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <BrandMark size={44} />
        <p className="text-sm text-muted-foreground max-w-sm">{msg}</p>
        <Button onClick={() => refetch()}>Повторить</Button>
      </div>
    );
  }
  // fail-closed: без пароля и без демо-режима — только инструкция по настройке
  if (data?.configured === false && data?.demoOpen === false) {
    return <SetupGate onRetry={() => refetch()} />;
  }
  if (data?.authRequired && !data.authed) {
    return <LoginView onDone={() => refetch()} />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <View />
        </AuthGate>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
