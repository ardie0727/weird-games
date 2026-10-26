import type { Metadata } from "next";
import { GhostLandlord } from "@/components/lab/GhostLandlord";

export const metadata: Metadata = { title: "Ghost Landlord" };

export default function Page() {
  return <GhostLandlord />;
}
