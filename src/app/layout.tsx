import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Ingenium — A little more understood.",
  description:
    "Your learning, in one thoughtful workspace. Project-based study, practice, simulations, resources and planning.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
