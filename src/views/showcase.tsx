"use client";

// Витрина — презентационная страница, которую строитель отправляет потенциальным
// заказчикам: «как я работаю и что вы увидите онлайн». Маркетинговая
// возможность: продавать прозрачность до подписания договора.
// Двуязычная (RU/UK) — следует языку интерфейса мастера.

import * as React from "react";
import { navigate } from "@/lib/router";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressRing, BrandMark, BrandWordmark, DemoChip } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  Camera,
  Check,
  Eye,
  FileSpreadsheet,
  HardHat,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Wallet,
} from "lucide-react";

function Footer({ uk }: { uk: boolean }) {
  return (
    <footer className="mt-auto border-t border-border/70 px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <p className="mx-auto max-w-3xl text-center text-[11px] leading-relaxed text-muted-foreground">
        {uk
          ? "Вітрина-демо «ПрорАКТ 360» · вигаданий майстер та об'єкти · прототип не пов'язаний з реальним сервером · вихідний проєкт "
          : "Витрина-демо «ПрорАКТ 360» · вымышленный мастер и объекты · прототип не связан с реальным сервером · исходный проект "}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="https://github.com/Sereban-glitch/proakt-build-bot"
          target="_blank"
          rel="noreferrer"
        >
          proakt-build-bot
        </a>
      </p>
    </footer>
  );
}

export function ShowcaseView() {
  const { lang } = useI18n();
  const uk = lang === "uk";

  const steps = uk
    ? [
        {
          icon: FileSpreadsheet,
          title: "1. Кошторис за 20 хвилин",
          text: "Приїду, заміряю, зберу кошторис за вами — за моїм прайсом, з коефіцієнтом за складність чесно і відкрито.",
        },
        {
          icon: Wallet,
          title: "2. Оплата за етапами",
          text: "Жодних «все одразу»: акт зробили — сплатили. Залишок за кожним актом видно онлайн.",
        },
        {
          icon: Camera,
          title: "3. Фото і етапи онлайн",
          text: "Посилання на ваш об'єкт: прогрес, фото прихованих робіт і питання — в одному місці, без дзвінків «ну як там?».",
        },
      ]
    : [
        {
          icon: FileSpreadsheet,
          title: "1. Смета за 20 минут",
          text: "Приеду, замерю, соберу смету при вас — по моему прайсу, с коэффициентом за сложность честно и открыто.",
        },
        {
          icon: Wallet,
          title: "2. Оплата по этапам",
          text: "Никаких «всё сразу»: акт сделали — оплатили. Остаток по каждому акту виден онлайн.",
        },
        {
          icon: Camera,
          title: "3. Фото и этапы онлайн",
          text: "Ссылка на ваш объект: прогресс, фото скрытых работ и вопросы — в одном месте, без звонков «ну как там?».",
        },
      ];

  return (
    <div className="bg-glow flex min-h-dvh flex-col bg-background">
      {/* Шапка */}
      <header className="glass sticky top-0 z-40 border-b border-border/70 px-4 py-2.5">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5">
          <BrandMark size={30} />
          <div className="min-w-0 flex-1 leading-tight">
            <BrandWordmark compact />
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {uk ? "вітрина майстра" : "витрина мастера"}
            </p>
          </div>
          <DemoChip />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 pb-12 pt-6">
        {/* Hero */}
        <section className="space-y-4 text-center">
          <Badge variant="outline" className="mx-auto border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <ShieldCheck className="size-3.5" /> {uk ? "Прозорий ремонт — без сюрпризів" : "Прозрачный ремонт — без сюрпризов"}
          </Badge>
          <h1 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            Ваш ремонт —{" "}
            <span className="text-primary">{uk ? "у вас на екрані" : "у вас на экране"}</span>
          </h1>
          <p className="mx-auto max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
            {uk
              ? "Кошторис з поясненням кожного рядка, фото прихованих робіт, статуси етапів і погодження онлайн. Ви завжди знаєте, на що йдуть гроші — навіть коли стіни вже зашпакльовані."
              : "Смета с объяснением каждой строки, фото скрытых работ, статусы этапов и согласование онлайн. Вы всегда знаете, на что уходят деньги — даже когда стены уже зашпаклёваны."}
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <Button onClick={() => navigate("#/client/demo-tihaya-gavan")}>
              <Eye className="size-4" /> {uk ? "Подивитись живий приклад" : "Посмотреть живой пример"}
            </Button>
            <Button variant="outline" onClick={() => navigate("#/")}>
              <ArrowLeftish /> {uk ? "Кабінет майстра" : "Кабинет мастера"}
            </Button>
          </div>
        </section>

        {/* Как это работает */}
        <section className="space-y-3">
          <h2 className="text-center text-lg font-bold tracking-tight">
            {uk ? "Як це працює" : "Как это работает"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {steps.map((s) => (
              <Card key={s.title}>
                <CardContent className="space-y-2 p-5">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15">
                    <s.icon className="size-5 text-primary" />
                  </div>
                  <p className="text-[15px] font-bold">{s.title}</p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{s.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Что вы видите */}
        <section className="space-y-3">
          <h2 className="text-center text-lg font-bold tracking-tight">
            {uk ? "Що ви побачите в кабінеті об'єкта" : "Что вы увидите в кабинете объекта"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-3">
                  <ProgressRing value={91} size={64} sub="готово" />
                  <div className="leading-tight">
                    <p className="text-sm font-bold">{uk ? "Прогрес об'єкта" : "Прогресс объекта"}</p>
                    <p className="text-xs text-muted-foreground">
                      {uk ? "етапи і терміни — як потяг по рейках" : "этапы и сроки — как поезд по рельсам"}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5 text-[13px] text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Check className="size-3.5 text-ok" /> {uk ? "Чорнові роботи — прийнято" : "Черновые работы — принято"}
                  </p>
                  <p className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-primary" /> {uk ? "Зараз: малярні роботи" : "Сейчас: малярные работы"}
                  </p>
                  <p className="flex items-center gap-2">
                    <HardHat className="size-3.5 text-warn" /> {uk ? "Далі: фініш і прибирання" : "Дальше: финиш и уборка"}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2.5 p-5">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <Sparkles className="size-4 text-primary" />{" "}
                  {uk ? "Приховані роботи — з поясненням" : "Скрытые работы — с объяснением"}
                </p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {uk
                    ? "«Чому підготовка — половина кошторису?» Ґрунт, шпаклівка, армування: що це, навіщо і скільки коштує — з фото кожного етапу. Більше жодних «а що за 40 тисяч?»"
                    : "«Почему подготовка — половина сметы?» Грунт, шпаклёвка, армировка: что это, зачем и сколько стоит — с фото каждого этапа. Больше никаких «а что за 40 тысяч?»"}
                </p>
                <Separator />
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {[1, 2, 3].map((i) => (
                      <img
                        key={i}
                        src={`/api/photo/${10 + i}`}
                        alt={uk ? "Фото прихованих робіт (приклад, демо)" : "Фото скрытых работ (пример, демо)"}
                        className="size-12 rounded-lg border-2 border-card object-cover"
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {uk ? "фотоетапи приходять самі" : "фотоэтапы приходят сами"}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2.5 p-5">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <ThumbsUp className="size-4 text-primary" /> {uk ? "Кошторис — в один клік" : "Смета — в один клик"}
                </p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {uk
                    ? "Чистові роботи і прихована підготовка — окремо, з підсумком. Не згодні з рядком? Задайте питання прямо в кошторисі — відповім там само."
                    : "Чистовые работы и скрытая подготовка — по отдельности, с итогом. Не согласны со строкой? Задайте вопрос прямо в смете — отвечу там же."}
                </p>
                <Badge variant="outline" className="border-ok/30 bg-ok-soft text-xs font-semibold text-ok">
                  <Check className="size-3" /> {uk ? "Погоджено онлайн" : "Согласовано онлайн"}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2.5 p-5">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <MessageSquare className="size-4 text-primary" /> {uk ? "Питання — на місці" : "Вопрос — на месте"}
                </p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {uk
                    ? "Кожне питання і відповідь залишаються в історії кошторису: не потрібно шукати листування в месенджері. Посилання відкривається в браузері — без застосунків і реєстрацій."
                    : "Каждый вопрос и ответ остаются в истории сметы: не нужно искать переписку в мессенджере. Ссылка открывается в браузере — без приложений и регистраций."}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Доверие */}
        <section className="rounded-2xl border border-primary/25 bg-primary/5 p-6 text-center">
          <h2 className="text-lg font-bold tracking-tight">
            {uk ? "Прозорість замість «повірте на слово»" : "Прозрачность вместо «поверьте на слово»"}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-pretty text-[13px] leading-relaxed text-muted-foreground">
            {uk
              ? "Ремонт — це великі гроші і чужі терміни. Я працюю так, щоб ви бачили кожен крок і кожну гривню: кошторис погоджується до початку, фото з'являються по ходу, оплати йдуть за актами."
              : "Ремонт — это большие деньги и чужие сроки. Я работаю так, чтобы вы видели каждый шаг и каждую гривну: смета согласуется до начала, фото появляются по ходу, оплаты идут по актам."}
          </p>
        </section>

        {/* CTA */}
        <section className="space-y-3 text-center">
          <h2 className="text-xl font-bold tracking-tight">{uk ? "Хочете так само?" : "Хотите так же?"}</h2>
          <p className="mx-auto max-w-md text-[13px] text-muted-foreground">
            {uk
              ? "Напишіть — обговоримо ваш об'єкт, я зберу кошторис і надішлю посилання на кабінет."
              : "Напишите — обсудим ваш объект, я соберу смету и пришлю ссылку на кабинет."}
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <Button onClick={() => navigate("#/client/demo-tihaya-gavan")}>
              <Eye className="size-4" /> {uk ? "Відкрити приклад кабінету" : "Открыть пример кабинета"}
            </Button>
            <Button
              variant="outline"
              disabled
              title={
                uk
                  ? "У демо зв'язок вимкнено — замість цього відкрийте приклад кабінету"
                  : "В демо связь отключена — вместо этого откройте пример кабинета"
              }
            >
              <Phone className="size-4" /> {uk ? "Зв'язатися (демо)" : "Связаться (демо)"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {uk
              ? "Це демонстраційна вітрина: контакти вигадані, кнопки зв'язку вимкнені."
              : "Это демонстрационная витрина: контакты вымышлены, кнопки связи отключены."}
          </p>
        </section>
      </main>

      <Footer uk={uk} />
    </div>
  );
}

function ArrowLeftish() {
  return <ArrowRight className="size-4 rotate-180" />;
}
