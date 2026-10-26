import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Press_Start_2P, VT323 } from "next/font/google";
import "./globals.css";

const press = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press", display: "swap" });
const vt = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Weird Games", template: "%s · Weird Games" },
  description: "Odd little arcade games for the browser. Starting with Query Arcade: a retro SQL and PySpark game.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05040b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${press.variable} ${vt.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
