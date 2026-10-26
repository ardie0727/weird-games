import type { Metadata } from "next";
import { QueueJumper } from "@/components/lab/QueueJumper";

export const metadata: Metadata = { title: "Queue Jumper" };

export default function Page() {
  return <QueueJumper />;
}
