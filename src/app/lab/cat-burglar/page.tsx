import type { Metadata } from "next";
import { CatBurglar } from "@/components/lab/CatBurglar";

export const metadata: Metadata = { title: "Cat Burglar" };

export default function Page() {
  return <CatBurglar />;
}
