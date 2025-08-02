import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import {
  ThemeProvider,
  ThemeStyleProvider,
} from "@/components/layouts/theme-provider";
import { Toaster } from "ui/sonner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tercihify - Akıllı Tercih Asistanı",
  description:
    "Tercihify ile YÖK Atlas verilerine metin ve sesli sohbet üzerinden kolayca erişin. Üniversite tercihleri, bölümler ve eğitim bilgileri hakkında sorularınızı sorun.",
  keywords: [
    "yök atlas",
    "üniversite tercih",
    "sohbet bot",
    "sesli sohbet",
    "eğitim danışmanlığı",
    "yapay zeka",
    "üniversite rehberi",
    "tercih asistanı",
  ],
  authors: [{ name: "Tercihify Team" }],
  creator: "@emirkisa",
  publisher: "Tercihify",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    url: "https://tercihify.com", // Replace with your actual domain
    title: "Tercihify - YÖK Atlas ile Sohbet Et",
    description:
      "Tercihify ile YÖK Atlas verilerine metin ve sesli sohbet üzerinden kolayca erişin. Üniversite tercihleri, bölümler ve eğitim bilgileri hakkında sorularınızı sorun.",
    siteName: "Tercihify",
    images: [
      {
        url: "/og-image.png", // You'll need to add this image
        width: 1200,
        height: 630,
        alt: "Tercihify - YÖK Atlas ile Sohbet Et",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tercihify - YÖK Atlas ile Sohbet Et",
    description:
      "Tercihify ile YÖK Atlas verilerine metin ve sesli sohbet üzerinden kolayca erişin. Üniversite tercihleri, bölümler ve eğitim bilgileri hakkında sorularınızı sorun.",
    images: ["/og-image.png"], // Same image as OpenGraph
    creator: "@tercihify", // Replace with your actual Twitter handle
  },
  verification: {
    google: "your-google-verification-code", // Add when you verify with Google Search Console
    // yandex: "your-yandex-verification-code", // For Yandex (popular in Turkey)
  },
  alternates: {
    canonical: "https://tercihify.com", // Replace with your actual domain
    languages: {
      "tr-TR": "/tr",
      "en-US": "/en",
    },
  },
  category: "Technology",
};

// const themes = BASE_THEMES.flatMap((t) => [t, `${t}-dark`]);

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          themes={["light", "dark"]}
          storageKey="app-theme-v2"
          disableTransitionOnChange
        >
          <ThemeStyleProvider>
            <NextIntlClientProvider>
              <div id="root">
                {children}
                <Toaster richColors />
              </div>
            </NextIntlClientProvider>
          </ThemeStyleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
