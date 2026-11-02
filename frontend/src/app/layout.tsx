import type { Metadata } from "next";
import { Exo_2, Orbitron } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { Intro } from "@/components/intro";
import { SpaceBackground } from "@/components/space-background";

const exo = Exo_2({ variable: "--font-exo", subsets: ["latin"] });
const orbitron = Orbitron({ variable: "--font-orbitron", subsets: ["latin"], weight: ["500", "700", "900"] });

export const metadata: Metadata = {
  title: "ThreatGraph",
  description: "Detection of coordinated network intrusions using graph-based data mining and clustering.",
};

// Runs before first paint: skip the intro for reduced-motion users without a flash.
const introGate = `try{if(matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.dataset.intro="skip"}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introGate }} />
        <style>{`html[data-intro="skip"] .tg-intro{display:none}`}</style>
      </head>
      <body className={`${exo.variable} ${orbitron.variable} font-sans antialiased`}>
        <SpaceBackground />
        <Intro />
        <div className="relative z-10">
          <AppShell>{children}</AppShell>
        </div>
      </body>
    </html>
  );
}
