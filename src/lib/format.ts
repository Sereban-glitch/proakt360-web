// Форматирование для «ПрорАКТ 360»: деньги (грн), даты, множественные числа (RU / UK).

const NBSP = "\u202F"; // узкий пробел — как в живых сметах мастера

export function money(v: number): string {
  const rounded = Math.round(v * 100) / 100;
  const int = Math.trunc(rounded);
  const frac = Math.round((rounded - int) * 100);
  const s = Math.abs(int)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const sign = rounded < 0 ? "−" : "";
  return `${sign}${s}${frac > 0 ? "," + String(frac).padStart(2, "0") : ""}${NBSP}грн`;
}

/** Короткие деньги для дашборда: 126 400 грн → «126,4 тыс» / «126,4 тис». */
export function moneyShort(v: number, lang: "ru" | "uk" = "ru"): string {
  const abs = Math.abs(v);
  const thousand = lang === "uk" ? "тис" : "тыс";
  const million = "млн";
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(".", ",")}${NBSP}${million}`;
  if (abs >= 10_000) return `${(v / 1000).toFixed(0)}${NBSP}${thousand}`;
  if (abs >= 1000) return `${(v / 1000).toFixed(1).replace(".", ",")}${NBSP}${thousand}`;
  return Math.round(v).toString();
}

export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return few;
  return many;
}

export function qty(v: number): string {
  const rounded = Math.round(v * 100) / 100;
  return rounded.toString().replace(".", ",");
}

const MONTHS_SHORT_RU = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_SHORT_UK = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];

const MONTHS_FULL_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
];
const MONTHS_FULL_UK = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"
];

export function dateShort(iso: string, lang: "ru" | "uk" = "ru"): string {
  const d = new Date(iso);
  const months = lang === "uk" ? MONTHS_SHORT_UK : MONTHS_SHORT_RU;
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export function dateFull(iso: string, lang: "ru" | "uk" = "ru"): string {
  const d = new Date(iso);
  const months = lang === "uk" ? MONTHS_FULL_UK : MONTHS_FULL_RU;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function dateTime(iso: string, lang: "ru" | "uk" = "ru"): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dateShort(iso, lang)}, ${hh}:${mm}`;
}

/** «через 21 день» / «5 дней назад» / «через 21 день» / «5 днів тому» для дедлайнов */
export function daysLeft(iso: string, lang: "ru" | "uk" = "ru"): { text: string; overdue: boolean; days: number } {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  const uk = lang === "uk";
  if (days === 0) return { text: uk ? "сьогодні" : "сегодня", overdue: false, days: 0 };
  if (days > 0) {
    return {
      text: uk
        ? `через ${days} ${plural(days, "день", "дні", "днів")}`
        : `через ${days} ${plural(days, "день", "дня", "дней")}`,
      overdue: false,
      days,
    };
  }
  const posDays = -days;
  return {
    text: uk
      ? `${posDays} ${plural(posDays, "день", "дні", "днів")} тому`
      : `${posDays} ${plural(posDays, "день", "дня", "дней")} назад`,
    overdue: true,
    days,
  };
}

export const EST_STATUS: Record<string, { label: string; labelRu: string; labelUk: string; tone: "draft" | "sent" | "approved" | "done" }> = {
  draft: { label: "Черновик", labelRu: "Черновик", labelUk: "Чернетка", tone: "draft" },
  sent: { label: "У заказчика", labelRu: "У заказчика", labelUk: "У замовника", tone: "sent" },
  approved: { label: "Согласована", labelRu: "Согласована", labelUk: "Погоджена", tone: "approved" },
  done: { label: "Закрыта", labelRu: "Закрыта", labelUk: "Закрита", tone: "done" },
};

export const ACT_STATUS: Record<string, { label: string; labelRu: string; labelUk: string }> = {
  paid: { label: "Оплачен", labelRu: "Оплачен", labelUk: "Сплачений" },
  partial: { label: "Частично", labelRu: "Частично", labelUk: "Частково" },
  unpaid: { label: "Ждёт оплаты", labelRu: "Ждёт оплаты", labelUk: "Чекає оплати" },
  zero: { label: "Без суммы", labelRu: "Без суммы", labelUk: "Без суми" },
};

export const OBJECT_STATUS: Record<string, { label: string; labelRu: string; labelUk: string }> = {
  active: { label: "В работе", labelRu: "В работе", labelUk: "В роботі" },
  paused: { label: "Пауза", labelRu: "Пауза", labelUk: "Пауза" },
  done: { label: "Завершён", labelRu: "Завершён", labelUk: "Завершений" },
};

export const STAGE_STATUS: Record<string, { label: string; labelRu: string; labelUk: string }> = {
  done: { label: "Готово", labelRu: "Готово", labelUk: "Готово" },
  current: { label: "Сейчас", labelRu: "Сейчас", labelUk: "Зараз" },
  next: { label: "Далее", labelRu: "Далее", labelUk: "Далі" },
  todo: { label: "Впереди", labelRu: "Впереди", labelUk: "Попереду" },
};
