import type { Metadata } from "next";
import { RubberBulletMan } from "@/components/rbm/RubberBulletMan";

export const metadata: Metadata = {
  title: "Rubber Bullet Man",
  description: "A retro arena shooter where every bullet bounces, including back at you. Trick shots, chain kills and a Rubber King boss.",
};

export default function Page() {
  return <RubberBulletMan />;
}
