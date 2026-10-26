import type { Metadata } from "next";
import { CloudSculptor } from "@/components/lab/CloudSculptor";

export const metadata: Metadata = { title: "Cloud Sculptor" };

export default function Page() {
  return <CloudSculptor />;
}
