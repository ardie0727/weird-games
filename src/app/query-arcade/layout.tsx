import type { Metadata } from "next";
import { Cabinet } from "@/components/qa/Cabinet";

export const metadata: Metadata = {
  title: { default: "Query Arcade", template: "%s · Query Arcade" },
  description: "A fast retro arcade for SQL and PySpark. Real SQL in your browser, daily synthetic datasets, global high scores.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Cabinet>{children}</Cabinet>;
}
