"use client";

import Link from "next/link";
import { useState } from "react";
import { ResearchPreparation } from "@/components/research-preparation";
import { VoiceSessionWidget } from "@/components/voice/voice-session-widget";

type AtendimentoFlowProps = {
  leadId: string;
  executionId: string;
  initialRunId: string | null;
  visitorName: string;
};

export function AtendimentoFlow({ leadId, executionId, initialRunId, visitorName }: AtendimentoFlowProps) {
  const [conversationStarted, setConversationStarted] = useState(false);

  if (conversationStarted) {
    return (
      <section className="narrow page-space">
        <VoiceSessionWidget leadId={leadId} visitorName={visitorName} autoStart />
      </section>
    );
  }

  return (
    <section className="narrow page-space">
      <span className="eyebrow">Cadastro recebido</span>
      <h1>Obrigado, {visitorName.split(" ")[0]}<span>.</span></h1>
      <p className="lede">Aguarde enquanto preparamos seu atendimento.</p>
      <ResearchPreparation
        leadId={leadId}
        executionId={executionId}
        initialRunId={initialRunId}
        onStartConversation={() => setConversationStarted(true)}
      />
      <Link className="text-link" href="/">Voltar ao formulário</Link>
    </section>
  );
}
