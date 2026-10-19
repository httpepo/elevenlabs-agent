import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { demoLeads, deploymentAccess } from "@/infrastructure/bootstrap";
import { AtendimentoFlow } from "@/components/atendimento-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AtendimentoPage({ params }: { params: Promise<{ id: string }> }) {
  if (!deploymentAccess.isEnabled()) notFound();
  const { id } = await params;
  if (!await deploymentAccess.canAccessLead({ headers: await headers() }, id)) notFound();
  const lead = await demoLeads.get(id);
  if (!lead) notFound();
  return <AtendimentoFlow leadId={lead.id} executionId={lead.executionId} initialRunId={lead.research.runId} visitorName={lead.normalized.fullName} />;
}
