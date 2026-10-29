import type { Metadata } from "next";
import { ShadowMatch } from "@/components/lab/ShadowMatch";

export const metadata: Metadata = {
  title: "Shadow Match",
  description: "A lamp throws a strange object's shadow on the wall. Turn it until the shadow fills the outline. The light keeps moving.",
};

export default function Page() {
  return <ShadowMatch />;
}
