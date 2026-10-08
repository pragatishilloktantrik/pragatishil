import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pragatishil.org"),
  title: "Pragatishil Loktantrik Party",
  description: "Official website of Pragatishil Loktantrik Party - Nepali Soil, Our Path.",
  manifest: "/manifest.webmanifest",
  openGraph: { title: "Pragatishil Loktantrik Party", description: "नेपाली माटो, हाम्रो बाटो", images: [{ url: "/brand/social-preview.png", width: 1200, height: 630 }] },
  icons: {
    icon: [{ url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" }],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

import SafeNavbar from "@/components/SafeNavbar";
import Footer from "@/components/Footer";
import { LanguageProvider } from "@/context/LanguageContext";
import { ToastProvider } from "@/context/ToastContext";
import { SiteSettingsProvider } from "@/context/SiteSettingsContext";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch global settings from DB
  const supabase = await createClient();
  const { data: globalData } = await supabase
    .from('site_settings')
    .select('content')
    .eq('key', 'global')
    .single();

  // Fetch hero settings for footer tagline fallback
  const { data: heroData } = await supabase
    .from('site_settings')
    .select('content')
    .eq('key', 'hero')
    .single();

  const siteSettings = {
    contact: globalData?.content?.contact,
    social: globalData?.content?.social,
    footer: globalData?.content?.footer,
    nav: globalData?.content?.nav,
    hero: heroData?.content,
  };

  return (
    <html lang="ne">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-brand-tricolor font-sans`}
        suppressHydrationWarning
      >
        <LanguageProvider>
          <ToastProvider>
            <SiteSettingsProvider settings={siteSettings}>
              <SafeNavbar />
              <div className="pt-16 min-h-screen">
                {children}
              </div>
              <Footer />
            </SiteSettingsProvider>
          </ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
