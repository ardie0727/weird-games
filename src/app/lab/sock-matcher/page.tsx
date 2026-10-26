import type { Metadata } from "next";
import { SockMatcher } from "@/components/lab/SockMatcher";

export const metadata: Metadata = { title: "Sock Matcher" };

export default function Page() {
  return <SockMatcher />;
}
