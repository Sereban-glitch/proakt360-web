"use client";

// Настройки: язык (RU/UK), имя мастера и компании (для документов),
// пароль (установка/смена), бэкап (скачать JSON) и восстановление из файла,
// импорт прайс-каталога из JSON-файла.

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { SectionHead, ButtonSpinner } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Languages, KeyRound, DatabaseBackup, Upload, Download, UserRound } from "lucide-react";

export function SettingsView() {
  const { t, lang, setLang } = useI18n();
  const uk = lang === "uk";
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.settings() });

  const [masterName, setMasterName] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [oldPassword, setOldPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const restoreInput = React.useRef<HTMLInputElement>(null);
  const catalogInput = React.useRef<HTMLInputElement>(null);
  const [catalogMode, setCatalogMode] = React.useState<"merge" | "replace">("merge");
  const initialized = React.useRef(false);

  React.useEffect(() => {
    if (settings.data && !initialized.current) {
      initialized.current = true;
      setMasterName(settings.data.masterName);
      setCompanyName(settings.data.companyName);
    }
  }, [settings.data]);

  async function saveLang(next: "ru" | "uk") {
    setLang(next);
    try {
      await api.putSettings({ lang: next });
      toast.success(t("settingsSaved"));
    } catch {
      toast.error(t("error"));
    }
  }

  async function saveProfile() {
    setBusy(true);
    try {
      await api.putSettings({ masterName, companyName });
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(t("settingsSaved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    if (newPassword.length < 6) {
      toast.error(t("settingsPasswordLen"));
      return;
    }
    setBusy(true);
    try {
      await api.putSettings({ newPassword, oldPassword: oldPassword || undefined });
      setOldPassword("");
      setNewPassword("");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success(t("settingsSaved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function onRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm(t("settingsBackupRestoreWarning") + "\n\nПродолжить?")) return;
    setBusy(true);
    try {
      const data = JSON.parse(await file.text());
      const res = await api.restoreBackup(data);
      toast.success(
        `Восстановлено: объектов ${res.counts.objects ?? 0}, смет ${res.counts.estimates ?? 0}, актов ${res.counts.acts ?? 0}`
      );
      await qc.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось прочитать файл");
    } finally {
      setBusy(false);
    }
  }

  async function onCatalogFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const data = JSON.parse(await file.text());
      const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : null;
      if (!items) throw new ApiError(400, "Ожидается {items: [...]} или массив позиций");
      const res = await api.importCatalog(items, catalogMode);
      toast.success(`Каталог: создано ${res.created}, обновлено ${res.updated} (${res.mode})`);
      await qc.invalidateQueries({ queryKey: ["price"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось прочитать файл");
    } finally {
      setBusy(false);
    }
  }

  if (settings.isLoading) {
    return <div className="p-4 sm:p-6 space-y-4"><div className="h-32 animate-pulse rounded-xl bg-muted" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <SectionHead title={t("settingsTitle")} />

      {/* Язык */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Languages className="size-4 text-primary" /> {t("settingsLang")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={lang} onValueChange={(v) => saveLang(v as "ru" | "uk")}>
            <SelectTrigger className="w-full sm:w-64" aria-label={t("settingsLang")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ru">Русский</SelectItem>
              <SelectItem value="uk">Українська</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">
            Влияет на интерфейс, кабинет клиента и текст актов для Telegram.
          </p>
        </CardContent>
      </Card>

      {/* Профиль */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-4 text-primary" /> {t("settingsMasterName")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="masterName">{t("settingsMasterName")}</Label>
            <Input
              id="masterName"
              value={masterName}
              onChange={(e) => setMasterName(e.target.value)}
              placeholder="Иван Иванов"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyName">{t("settingsCompany")}</Label>
            <Input
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Мастер-отделка"
            />
          </div>
          <Button onClick={saveProfile} disabled={busy}>
            {busy ? <ButtonSpinner /> : t("save")}
          </Button>
        </CardContent>
      </Card>

      {/* Безопасность */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-primary" /> {t("settingsSecurity")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="text-sm">
              <p className="font-medium">{settings.data?.hasPassword ? t("settingsChangePassword") : t("settingsSetPassword")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settingsPasswordHint")}</p>
            </div>
            <Switch checked={settings.data?.hasPassword ?? false} disabled aria-label="password enabled" />
          </div>
          {settings.data?.hasPassword && (
            <div className="space-y-2">
              <Label htmlFor="oldPassword">{t("settingsOldPassword")}</Label>
              <Input
                id="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="newPassword">{t("settingsNewPassword")}</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={t("settingsPasswordLen")}
            />
          </div>
          <Button onClick={savePassword} disabled={busy || newPassword.length < 6}>
            {busy ? <ButtonSpinner /> : settings.data?.hasPassword ? t("settingsChangePassword") : t("settingsSetPassword")}
          </Button>
        </CardContent>
      </Card>

      {/* Бэкап */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DatabaseBackup className="size-4 text-primary" /> {t("settingsBackup")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={api.backupURL()} download>
                <Download className="size-4" /> {t("settingsBackupDownload")}
              </a>
            </Button>
            <Button variant="outline" onClick={() => restoreInput.current?.click()} disabled={busy}>
              <Upload className="size-4" /> {t("settingsBackupRestore")}
            </Button>
            <input
              ref={restoreInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onRestoreFile}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("settingsBackupRestoreWarning")}</p>
        </CardContent>
      </Card>

      {/* Импорт каталога */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="size-4 text-primary" /> {t("priceImport")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            JSON-файл вида {"{ items: [{name, unit, price, section, source, sourceDate}] }"} —
            источник и дата сохраняются для каждой позиции.
          </p>
          <div className="flex items-center gap-2">
            <Select value={catalogMode} onValueChange={(v) => setCatalogMode(v as "merge" | "replace")}>
              <SelectTrigger className="w-40" aria-label="режим импорта">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="merge">Обновить и добавить</SelectItem>
                <SelectItem value="replace">Заменить весь каталог</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => catalogInput.current?.click()} disabled={busy}>
              <Upload className="size-4" /> {t("priceImport")}
            </Button>
            <input
              ref={catalogInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onCatalogFile}
            />
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center pb-4">
        {uk
          ? "Пароль зберігається локально (sha256 + сіль), сесія — HttpOnly cookie. Зовнішні сервіси не використовуються."
          : "Пароль хранится локально (sha256 + соль), сессия — HttpOnly cookie. Внешние сервисы не используются."}
      </p>
    </div>
  );
}
