import type { Metadata } from "next";
import { Profile } from "@/components/qa/Profile";

export const metadata: Metadata = { title: "Player" };

export default function Page() {
  return <Profile />;
}
