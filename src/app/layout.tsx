import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "ПрорАКТ 360 — сметы, объекты и оплаты строителя",
  description:
    "«ПрорАКТ 360»: быстрый конструктор смет, кабинет мастера и заказчика, этапы стройки, фото скрытых работ и контроль оплат.",
  icons: {
    icon: "/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className="font-sans antialiased bg-background text-foreground"
      >
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
