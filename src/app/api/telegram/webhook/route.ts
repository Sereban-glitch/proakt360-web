import { NextRequest, NextResponse } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "";
const WEBAPP_URL = process.env.WEBAPP_URL || "https://proakt-360.35-209-212-217.sslip.io/?v=2.2";

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    const msg = update?.message;
    if (!msg || !msg.chat || !msg.chat.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();

    if (text.startsWith("/start") || text.startsWith("/app")) {
      const userLang = msg.from?.language_code;
      const uk = userLang?.startsWith("uk");
      const welcomeText = uk
        ? "👋 Вітаємо у «ПрорАКТ 360»!\n\n" +
          "Кабінет будівельника: розцінки, кошториси, акти та фотозвіти для замовника.\n\n" +
          "Натисніть кнопку нижче, щоб відкрити кабінет:"
        : "👋 Добро пожаловать в «ПрорАКТ 360»!\n\n" +
          "Кабинет строителя: расценки, сметы, акты и фотоотчёты для заказчика.\n\n" +
          "Нажмите кнопку ниже, чтобы открыть кабинет:";

      const buttonText = uk ? "🚀 Відкрити ПрорАКТ 360" : "🚀 Открыть ПрорАКТ 360";

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: welcomeText,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: buttonText,
                  web_app: { url: WEBAPP_URL },
                },
              ],
            ],
            resize_keyboard: true,
          },
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    bot: "ProAktSmetaBot",
    webapp: WEBAPP_URL,
  });
}
