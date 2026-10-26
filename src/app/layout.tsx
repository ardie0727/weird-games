import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Press_Start_2P, VT323 } from "next/font/google";
import { BootScreen } from "@/components/site/BootScreen";
import "./globals.css";

const press = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press", display: "swap" });
const vt = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Weird Games", template: "%s · Weird Games" },
  description: "Odd little arcade games for the browser: Query Arcade (retro SQL and PySpark) and Daily Weird Guess (one absurd fact a day).",
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
    <html lang="en" className={`${press.variable} ${vt.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{if(sessionStorage.getItem("wg-booted"))document.documentElement.classList.add("booted")}catch(e){}` }} />
      </head>
      <body className="min-h-dvh antialiased">
        <BootScreen />
        {children}
      </body>
    </html>
  );
}
