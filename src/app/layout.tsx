import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/design-system/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import atlasLogo from "@/design-system/assets/brand/atlas-white.svg";
import atlasFavicon from "@/design-system/assets/brand/favicon-atlas.svg";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas | Qualificação comercial por voz",
  description: "Agente de voz B2B com pesquisa pré-call, qualificação SPICED e agendamento integrado.",
  robots: { index: false, follow: false },
  icons: {
    icon: { url: atlasFavicon.src, type: "image/svg+xml", sizes: "any" },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark">
      <body>
        <header className="site-header">
          <Link href="/" className="brand" aria-label="Atlas · início"><Image src={atlasLogo} alt="Atlas" width={102} height={20} priority /></Link>
          <nav aria-label="Navegação principal">
            <Button asChild variant="ghost" size="sm"><Link href="/">Atendimento</Link></Button>
            <Button asChild variant="ghost" size="sm"><Link href="/painel">Painel interno</Link></Button>
          </nav>
        </header>
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
