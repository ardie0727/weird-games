import type { Metadata } from "next";
import { Scores } from "@/components/qa/Scores";

export const metadata: Metadata = { title: "High Scores" };

export default function Page() {
  return <Scores />;
}
