import type { Metadata } from "next";
import { SnoozeButton } from "@/components/lab/SnoozeButton";

export const metadata: Metadata = { title: "Snooze Button" };

export default function Page() {
  return <SnoozeButton />;
}
