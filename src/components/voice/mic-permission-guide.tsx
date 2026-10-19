"use client";

import { Badge } from "@/design-system/components/ui/badge";
import { Button } from "@/design-system/components/ui/button";
import { Card } from "@/design-system/components/ui/card";

export type VoiceUiErrorKind = "permission" | "missing" | "network" | "credential" | "browser" | "generic";

type MicPermissionGuideProps = {
  kind: VoiceUiErrorKind;
  message: string;
  onRetry: () => void;
};

export function MicPermissionGuide({ kind, message, onRetry }: MicPermissionGuideProps) {
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
    title: "Atualize a página",
    instructions: "Atualize esta página e tente iniciar o atendimento novamente.",
  };
  if (kind === "browser") return {
    title: "Navegador sem suporte",
    instructions: "Abra esta página em um navegador atualizado e use uma conexão segura para habilitar o áudio.",
  };
  if (kind === "network") return {
    title: "Conexão interrompida",
    instructions: "Confira sua conexão e tente novamente.",
  };
  return {
    title: "Não foi possível iniciar",
    instructions: "Aguarde alguns instantes e tente novamente.",
  };
}
