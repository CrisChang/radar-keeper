import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar Keeper",
  description:
    "Autonomous market-risk detection with reliable onchain execution through KeeperHub.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
