import type { Metadata } from "next";
import { Race } from "@/components/qa/Race";

export const metadata: Metadata = { title: "1v1 Race" };

export default function Page() {
  return <Race />;
}
