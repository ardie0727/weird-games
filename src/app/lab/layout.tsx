import type { Metadata } from "next";

// The lab is unlisted: reachable only by tapping the hub's Coming Soon card.
export const metadata: Metadata = {
  title: { default: "Lab", template: "%s · Lab · Weird Games" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
