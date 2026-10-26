import type { Metadata } from "next";
import { ShadowMatch } from "@/components/lab/ShadowMatch";

export const metadata: Metadata = { title: "Shadow Match" };

export default function Page() {
  return <ShadowMatch />;
}
