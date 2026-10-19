import { db } from "@/lib/db";
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies, headers } from "next/headers";

// ---------------------------------------------------------------------------
// Аутентификация мастера: локальный пароль + сессии в SQLite.
// Хеширование — scrypt (проверенный password KDF из состава Node.js/crypto):
//   N=16384, r=8, p=1, keyLen=64, соль 16 случайных байт на пароль.
// Формат хранения: scrypt$N$r$p$<salt hex>$<hash hex>.
// Пароли первой версии (sha256(salt+пароль)) принимаются и прозрачно
// апгрейдятся до scrypt при первом успешном входе — существующая база
// не ломается.
//
// ОТКАЗ В ДОСТУПЕ ПО УМОЛЧАНИЮ (fail-closed):
//   • пароль НЕ установлен и НЕ включён явный демо-режим
//     (PROAKT_DEMO_OPEN=1) → все мастерские маршруты закрыты (503),
//     удалённо задать пароль нельзя — только локально через
//     `npm run setup:password` (см. README «Первоначальная настройка»);
//   • пароль установлен → требуется сессия (401 без неё).
// Никаких внешних сервисов, OAuth и ключей.
// ---------------------------------------------------------------------------

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

export const SESSION_COOKIE = "proakt360_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const SCRYPT_PREFIX = "scrypt$";

export const SETUP_ERROR =
  "Сервер не настроен: пароль мастера не задан. Запустите на сервере `npm run setup:password` (или включите изолированный демо-режим PROAKT_DEMO_OPEN=1). Удалённая настройка запрещена.";

/** Явно включённый изолированный демо-режим: мастерские API открыты без пароля. */
export function demoOpenMode(): boolean {
  const v = process.env.PROAKT_DEMO_OPEN;
  return v === "1" || v === "true" || v === "yes";
}

export function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export async function getSettings() {
  let s = await db.appSettings.findUnique({ where: { id: 1 } });
  if (!s) {
    s = await db.appSettings.create({ data: { id: 1 } });
  }
  return s;
}

export function isAuthRequired(passHash: string): boolean {
  return passHash.trim().length > 0;
}

/** Хешировать пароль scrypt'ом. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `${SCRYPT_PREFIX}${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${key.toString("hex")}`;
}

export async function setPassword(newPassword: string): Promise<void> {
  const hash = await hashPassword(newPassword);
  await db.appSettings.update({ where: { id: 1 }, data: { passHash: hash, passSalt: "" } });
  // смена пароля аннулирует все сессии
  await db.session.deleteMany({});
}

/** Сравнение буферов постоянного времени. */
function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Проверить пароль. Если пароль вообще не задан — всегда false
 * (открытым «демо без пароля» управляет только PROAKT_DEMO_OPEN).
 */
export async function verifyPassword(input: string): Promise<boolean> {
  const s = await getSettings();
  if (!isAuthRequired(s.passHash)) return false;
  const stored = s.passHash;

  // --- формат v1: sha256(salt + пароль) — проверяем и апгрейдим на лету ---
  if (!stored.startsWith(SCRYPT_PREFIX)) {
    const expect = Buffer.from(stored, "hex");
    const got = Buffer.from(sha256(s.passSalt + input), "hex");
    const ok = expect.length === got.length && safeEqual(expect, got);
    if (ok) {
      try {
        const upgraded = await hashPassword(input);
        await db.appSettings.update({ where: { id: 1 }, data: { passHash: upgraded, passSalt: "" } });
        await db.session.deleteMany({}); // перелогин после апгрейда
      } catch {
        // апгрейд не критичен — вход уже подтверждён
      }
    }
    return ok;
  }

  // --- формат v2: scrypt ---
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [prefix, nStr, rStr, pStr, salt, hex] = parts;
  if (prefix !== "scrypt" || !nStr || !rStr || !pStr || !salt || !hex) return false;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (N < 2 || N > 2 ** 22 || r < 1 || p < 1) return false;
  try {
    const expected = Buffer.from(hex, "hex");
    if (expected.length === 0) return false;
    const actual = await scrypt(input, salt, expected.length, { N, r, p, maxmem: SCRYPT_MAXMEM });
    return safeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function createSession(): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      token,
      appSettingsId: 1,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

/** Проверка подписи Telegram WebApp initData (HMAC-SHA256). */
export function verifyTelegramInitData(
  initData: string,
  botToken: string
): { valid: boolean; user?: TelegramUser } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { valid: false };

    params.delete("hash");
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join("\n");

    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (calculatedHash !== hash) return { valid: false };

    const userRaw = params.get("user");
    const user = userRaw ? (JSON.parse(userRaw) as TelegramUser) : undefined;
    return { valid: true, user };
  } catch {
    return { valid: false };
  }
}

export type MasterAccess =
  | { ok: true; via: "demo" | "session" | "telegram"; user?: TelegramUser }
  | { ok: false; status: 401 | 503; error: string };

/**
 * Единая проверка доступа мастера (без Origin-проверки — её делает
 * requireMaster в http.ts). Вызывайте из роутов, где мастерский доступ
 * чередуется с клиентским токеном (комментарии, согласование, файлы фото).
 */
export async function checkMaster(): Promise<MasterAccess> {
  const s = await getSettings();
  if (!isAuthRequired(s.passHash)) {
    if (demoOpenMode()) return { ok: true, via: "demo" };
    return { ok: false, status: 503, error: SETUP_ERROR };
  }

  // 1. Проверяем Telegram initData, если передан
  try {
    const reqHeaders = await headers();
    const tgInitData = reqHeaders.get("x-telegram-init-data");
    if (tgInitData) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "";
      const tg = verifyTelegramInitData(tgInitData, botToken);
      if (tg.valid) {
        return { ok: true, via: "telegram", user: tg.user };
      }
    }
  } catch {
    // headers() может быть недоступен вне контекста запроса
  }

  // 2. Проверяем сессионную cookie
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, status: 401, error: "Требуется вход мастера" };
  const session = await db.session.findUnique({ where: { token } });
  if (!session) return { ok: false, status: 401, error: "Требуется вход мастера" };
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return { ok: false, status: 401, error: "Требуется вход мастера" };
  }
  return { ok: true, via: "session" };
}

/** Состояние входа для /api/auth/me и гейта фронтенда. */
export async function getSessionUser(): Promise<{
  authed: boolean;
  required: boolean;
  configured: boolean;
  demoOpen: boolean;
  user?: TelegramUser;
}> {
  const s = await getSettings();
  const configured = isAuthRequired(s.passHash);
  const demoOpen = demoOpenMode();
  if (!configured) {
    // без пароля: открытый доступ — только в явно включённом демо-режиме
    return { authed: demoOpen, required: false, configured: false, demoOpen };
  }
  const access = await checkMaster();
  return { authed: access.ok, required: true, configured: true, demoOpen, user: access.ok ? access.user : undefined };
}

export async function dropSession(token: string): Promise<void> {
  await db.session.deleteMany({ where: { token } });
}

// Разрешение токена клиентского доступа: это может быть
// 1) clientToken объекта → кабинет объекта,
// 2) shareToken сметы → кабинет объекта этой сметы,
// 3) token акта → кабинет объекта этого акта.
// Так «прямые ссылки» из сметы и акта открывают один и тот же кабинет.
export async function resolveClientToken(
  token: string,
): Promise<
  | { ok: true; objectId: number; kind: "object" | "estimate" | "act"; refId?: number }
  | { ok: false }
> {
  const obj = await db.buildObject.findUnique({ where: { clientToken: token } });
  if (obj) return { ok: true, objectId: obj.id, kind: "object" };
  const est = await db.estimate.findUnique({
    where: { shareToken: token },
    select: { id: true, objectId: true },
  });
  if (est) return { ok: true, objectId: est.objectId, kind: "estimate", refId: est.id };
  const act = await db.act.findUnique({
    where: { token: token },
    select: { id: true, objectId: true },
  });
  if (act) return { ok: true, objectId: act.objectId, kind: "act", refId: act.id };
  return { ok: false };
}
