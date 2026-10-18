import Link from "next/link";
import { Button } from "@/design-system/components/ui/button";

export default function NotFound() {
  return <section className="narrow page-space"><span className="eyebrow">Página indisponível</span><h1>Não encontramos este registro<span>.</span></h1><p>Confira o endereço ou volte ao início. O painel desta primeira versão está disponível apenas em desenvolvimento local.</p><Button asChild variant="brand" size="lg"><Link href="/">Voltar ao início <span aria-hidden="true">↗</span></Link></Button></section>;
}
