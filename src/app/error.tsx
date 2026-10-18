"use client";

import { Button } from "@/design-system/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="narrow page-space"><h1>Não foi possível abrir esta página<span>.</span></h1><p>Tente novamente em alguns instantes.</p><Button variant="brand" size="lg" onClick={reset}>Tentar novamente</Button></section>;
}
