import type { Metadata } from "next";
import { MosquitoBat } from "@/components/lab/MosquitoBat";

export const metadata: Metadata = { title: "Mosquito Bat" };

export default function Page() {
  return <MosquitoBat />;
}
