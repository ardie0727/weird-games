import type { Metadata, Viewport } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import { DownTheCouch } from "@/components/dtc/DownTheCouch";
import "./dtc.css";

const lilita = Lilita_One({ weight: "400", subsets: ["latin"], variable: "--dtc-display", display: "swap" });
const nunito = Nunito({ weight: ["500", "700", "800", "900"], subsets: ["latin"], variable: "--dtc-body", display: "swap" });

export const metadata: Metadata = {
  title: "Down the Couch",
  description: "A roguelite card RPG about small lost things fighting their way down through a sofa before the Vacuum comes.",
};

export const viewport: Viewport = {
  themeColor: "#1b1220",
};

export default function Page() {
  return (
    <div className={`${lilita.variable} ${nunito.variable}`}>
      <DownTheCouch />
    </div>
  );
}
