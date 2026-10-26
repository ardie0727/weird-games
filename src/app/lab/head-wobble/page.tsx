import type { Metadata } from "next";
import { HeadWobble } from "@/components/lab/HeadWobble";

export const metadata: Metadata = { title: "Head Wobble" };

export default function Page() {
  return <HeadWobble />;
}
