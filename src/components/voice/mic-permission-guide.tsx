"use client";

import Link from "next/link";
import { Badge } from "@/design-system/components/ui/badge";
import { Button } from "@/design-system/components/ui/button";
import { Card } from "@/design-system/components/ui/card";

export type VoiceUiErrorKind = "permission" | "missing" | "network" | "credential" | "browser" | "generic";

type MicPermissionGuideProps = {
  kind: VoiceUiErrorKind;
  message: string;
  leadId: string;
  onRetry: () => void;
};

export function MicPermissionGuide({ kind, message, leadId, onRetry }: MicPermissionGuideProps) {
  const guide = guideFor(kind);
  return (
    <Card className="border-destructive/50 bg-destructive/5 p-5" role="alert">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="destructive">Atenção</Badge>
        <span className="text-sm font-medium">{guide.title}</span>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      <p className="text-sm text-muted-foreground">{guide.instructions}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="button" variant="brand" onClick={onRetry}>Tentar novamente</Button>
        <Button asChild type="button" variant="outline"><Link href={`/painel/${leadId}`}>Ver status no painel</Link></Button>
      </div>
    </Card>
  );
}

function guideFor(kind: VoiceUiErrorKind): { title: string; instructions: string } {
  if (kind === "permission") return {
    title: "Microfone bloqueado",
    instructions: "Clique no ícone de cadeado ou microfone na barra de endereço, permita o microfone para este site e tente novamente.",
  };
  if (kind === "missing") return {
    title: "Microfone não encontrado",
    instructions: "Conecte ou selecione um dispositivo de entrada de áudio e tente iniciar a conversa novamente.",
  };
  if (kind === "credential") return {
    title: "Sessão expirada",
    instructions: "Atualize a página para renovar sua autorização. O atendimento só começa depois que o briefing correto está disponível.",
  };
  if (kind === "browser") return {
    title: "Navegador sem suporte",
    instructions: "Abra esta página em um navegador atualizado e use uma conexão segura para habilitar o áudio.",
  };
  if (kind === "network") return {
    title: "Conexão interrompida",
    instructions: "Confira sua conexão e tente novamente. A sessão não será marcada como concluída sem confirmação do provedor.",
  };
  return {
    title: "Não foi possível iniciar",
    instructions: "Tente novamente. Se o problema continuar, consulte o status do atendimento no painel.",
  };
}
