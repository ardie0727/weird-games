import type { Metadata } from "next";
import { MonkeyThief } from "@/components/lab/MonkeyThief";

export const metadata: Metadata = { title: "Monkey Thief" };

export default function Page() {
  return <MonkeyThief />;
}
