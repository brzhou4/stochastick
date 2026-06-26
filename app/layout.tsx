import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stochastick — Autonomous Quant Research Worker",
  description:
    "Stress-test an investment thesis before the market does. Stochastick tests your thesis against price behavior, volatility, benchmark-relative performance, tail risk, and stochastic forward simulations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
