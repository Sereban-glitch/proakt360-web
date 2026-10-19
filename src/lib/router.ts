"use client";

// Hash-роутер «ПрорАКТ 360» с бесшовной поддержкой Telegram WebApp и deep-linking:
// Маршрутизация по якорям (#/objects/3, #/client/token ...).
// Служебные параметры Telegram (#tgWebAppData=...&tgWebAppVersion=...) очищаются от маршрута,
// а initData надёжно сохраняется для авторизации без отображения в интерфейсе или логах.

import { useCallback, useEffect, useState } from "react";

export type Route = {
  path: string; // "/objects/3" или "/"
  segments: string[]; // ["objects", "3"]
  query: URLSearchParams;
  hash: string; // чистый хэш "#/objects/3"
};

/** Извлечение и тихое сохранение initData от Telegram (без логов и вывода в UI). */
function captureTelegramData(rawStr: string): { initData: string | null; startParam: string | null } {
  let initData: string | null = null;
  let startParam: string | null = null;

  // 1. Проверяем Telegram WebApp API
  if (typeof window !== "undefined") {
    try {
      const twa = (window as unknown as {
        Telegram?: {
          WebApp?: {
            initData?: string;
            initDataUnsafe?: { start_param?: string };
          };
        };
      }).Telegram?.WebApp;
      if (twa?.initData) {
        initData = twa.initData;
      }
      if (twa?.initDataUnsafe?.start_param) {
        startParam = twa.initDataUnsafe.start_param;
      }
    } catch {
      // игнорируем любые ошибки доступа к объекту окна
    }
  }

  // 2. Проверяем search params из window.location.search
  if (typeof window !== "undefined" && window.location.search) {
    try {
      const sp = new URLSearchParams(window.location.search);
      const d = sp.get("tgWebAppData");
      if (d && !initData) initData = d;
      const s = sp.get("tgWebAppStartParam");
      if (s && !startParam) startParam = s;
    } catch {
      // ignore
    }
  }

  // 3. Проверяем переданные в hash параметры
  if (
    rawStr &&
    (rawStr.includes("tgWebAppData=") ||
      rawStr.includes("tgWebAppStartParam=") ||
      rawStr.includes("query_id="))
  ) {
    try {
      const qIndex = rawStr.indexOf("?");
      const queryStr = qIndex !== -1 ? rawStr.slice(qIndex + 1) : rawStr;
      const sp = new URLSearchParams(queryStr);
      const d = sp.get("tgWebAppData");
      if (d && !initData) initData = d;
      const s = sp.get("tgWebAppStartParam");
      if (s && !startParam) startParam = s;
    } catch {
      // ignore
    }
  }

  // 4. Сохраняем initData в сессии без отображения
  if (typeof window !== "undefined") {
    try {
      if (initData) {
        sessionStorage.setItem("tg_init_data", initData);
        (window as unknown as { __tgInitData?: string }).__tgInitData = initData;
      } else {
        const stored = sessionStorage.getItem("tg_init_data");
        if (stored) {
          (window as unknown as { __tgInitData?: string }).__tgInitData = stored;
        }
      }
    } catch {
      // sessionStorage может быть недоступен в некоторых режимах инкогнито
    }
  }

  return { initData, startParam };
}

function parse(hash: string): Route {
  let raw = (hash || "#/").replace(/^#\/?/, "");

  // Проверяем служебные параметры Telegram
  const { startParam } = captureTelegramData(raw);

  // Если весь хэш или его начало — это служебные параметры Telegram
  if (
    raw.startsWith("tgWebApp") ||
    raw.includes("tgWebAppData=") ||
    raw.includes("query_id=") ||
    raw.includes("tgWebAppVersion=")
  ) {
    if (startParam) {
      if (startParam.startsWith("client_") || startParam.startsWith("c_")) {
        raw = `client/${startParam.replace(/^(client_|c_)/, "")}`;
      } else if (startParam.startsWith("object_")) {
        raw = `objects/${startParam.replace("object_", "")}`;
      } else if (startParam.startsWith("estimate_")) {
        raw = `estimates/${startParam.replace("estimate_", "")}`;
      } else if (startParam.startsWith("act_")) {
        raw = `acts/${startParam.replace("act_", "")}`;
      } else {
        raw = startParam;
      }
    } else {
      raw = "";
    }
  } else if (raw.includes("?")) {
    // Очищаем tgWebApp* из параметров запроса, если они были прикреплены к маршруту
    const [pathPart, queryPart] = raw.split("?");
    const sp = new URLSearchParams(queryPart);
    const cleanSp = new URLSearchParams();
    sp.forEach((val, key) => {
      if (
        !key.startsWith("tgWebApp") &&
        key !== "query_id" &&
        key !== "user" &&
        key !== "auth_date" &&
        key !== "hash" &&
        key !== "signature"
      ) {
        cleanSp.set(key, val);
      }
    });
    const qs = cleanSp.toString();
    raw = pathPart + (qs ? `?${qs}` : "");
  }

  const [pathPart, queryPart] = raw.split("?");
  const segments = (pathPart || "").split("/").filter(Boolean).map(decodeURIComponent);
  const cleanPath = "/" + segments.join("/");

  return {
    path: cleanPath,
    segments,
    query: new URLSearchParams(queryPart ?? ""),
    hash: `#${cleanPath}${queryPart ? `?${queryPart}` : ""}`,
  };
}

export function useRoute(): Route & { navigate: (to: string) => void } {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === "undefined" ? parse("#/") : parse(window.location.hash || "#/")
  );

  useEffect(() => {
    // При первичном запуске: если хэш содержал параметры Telegram, нормализуем URL
    if (typeof window !== "undefined") {
      const curHash = window.location.hash || "";
      if (
        curHash.includes("tgWebAppData=") ||
        curHash.startsWith("#tgWebApp") ||
        curHash.includes("query_id=") ||
        !curHash ||
        curHash === "#"
      ) {
        const parsed = parse(curHash);
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search + (parsed.path === "/" ? "#/" : parsed.hash)
        );
        setRoute(parsed);
      }
    }

    const onChange = () => {
      const curHash = window.location.hash || "#/";
      const parsed = parse(curHash);
      if (
        curHash.includes("tgWebAppData=") ||
        curHash.startsWith("#tgWebApp") ||
        curHash.includes("query_id=") ||
        !curHash ||
        curHash === "#"
      ) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search + (parsed.path === "/" ? "#/" : parsed.hash)
        );
      }
      setRoute(parsed);
    };

    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((to: string) => {
    const next = to.startsWith("#") ? to : `#${to.startsWith("/") ? to : `/${to}`}`;
    if (window.location.hash === next) return;
    window.location.hash = next;
  }, []);

  return { ...route, navigate };
}

export function navigate(to: string) {
  const next = to.startsWith("#") ? to : `#${to.startsWith("/") ? to : `/${to}`}`;
  window.location.hash = next;
}
