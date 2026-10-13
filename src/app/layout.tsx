import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AUREON — Know what you can afford",
    template: "%s · AUREON",
  },
  description:
    "AUREON helps you decide whether you can afford a purchase without putting your finances at risk before your next payday.",
  applicationName: "AUREON",
  authors: [{ name: "AUREON" }],
  keywords: [
    "affordability",
    "personal finance",
    "budgeting",
    "purchase calculator",
  ],
};

export const viewport: Viewport = {
  themeColor: "#0d1114",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
