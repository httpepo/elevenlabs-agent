import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/design-system/components/ui/badge";
import { Button } from "@/design-system/components/ui/button";
import atlasLogo from "@/design-system/assets/brand/atlas-ink.svg";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas | Qualificação comercial por voz",
  description: "Base de desenvolvimento do agente de qualificação comercial da Atlas.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="site-header">
          <Link href="/" className="brand" aria-label="Atlas · início"><Image src={atlasLogo} alt="Atlas" width={139} height={17} priority /></Link>
          <nav aria-label="Navegação principal">
            <Button asChild variant="ghost" size="sm"><Link href="/">Atendimento</Link></Button>
            <Button asChild variant="ghost" size="sm"><Link href="/painel">Painel interno</Link></Button>
          </nav>
          
        </header>
        <main>{children}</main>
        <footer className="site-footer">Qualificação comercial por voz comercial · Primeira etapa de desenvolvimento</footer>
      </body>
    </html>
  );
}
