import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameScreen } from "@/components/qa/GameScreen";
import { isModeId, MODE_ORDER, MODES } from "@/lib/game/modes";

export function generateStaticParams() {
  return MODE_ORDER.map((mode) => ({ mode }));
}

export async function generateMetadata({ params }: { params: Promise<{ mode: string }> }): Promise<Metadata> {
  const { mode } = await params;
  return { title: isModeId(mode) ? MODES[mode].name : "Play" };
}

export default async function Page({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  if (!isModeId(mode)) notFound();
  return <GameScreen key={mode} mode={mode} />;
}
