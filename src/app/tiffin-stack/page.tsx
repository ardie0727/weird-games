import type { Metadata } from "next";
import { TiffinStack } from "@/components/lab/TiffinStack";

export const metadata: Metadata = {
  title: "Tiffin Stack",
  description: "Drop steel tiffin boxes onto a tower riding a wobbly scooter, and steer to keep it from toppling.",
};

export default function Page() {
  return <TiffinStack />;
}
