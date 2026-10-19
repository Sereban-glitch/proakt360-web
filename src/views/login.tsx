"use client";

// Экран входа мастера: пароль → HttpOnly-сессия. Без внешних сервисов.

import * as React from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { BrandMark, ButtonSpinner } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginView({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-2xl"
      >
        <div className="flex flex-col items-center gap-3 mb-6">
          <BrandMark size={52} />
          <div className="text-center">
            <h1 className="text-lg font-semibold text-foreground">{t("loginTitle")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("loginSub")}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("loginPassword")}</Label>
          <Input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-500" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full mt-5 h-11" disabled={busy || !password}>
          {busy ? <ButtonSpinner /> : t("loginButton")}
        </Button>

        <p className="mt-4 text-[11px] text-muted-foreground text-center leading-relaxed">
          {t("loginNote")}
        </p>
      </motion.form>
    </div>
  );
}
