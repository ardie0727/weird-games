import type { Metadata } from "next";
import { CongaCrawl } from "@/components/conga/CongaCrawl";

export const metadata: Metadata = {
  title: "Conga Crawl",
  description: "A real-time roguelike: lead a wedding conga line down nine cursed floors. Guests join your line and fight for you.",
};

export default function Page() {
  return <CongaCrawl />;
}
