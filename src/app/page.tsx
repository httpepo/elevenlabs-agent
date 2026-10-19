import { LeadFormComponent } from "@/components/lead-form";
import { deploymentAccess } from "@/infrastructure/bootstrap";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const enabled = deploymentAccess.isEnabled();
  return (
    <div className="home-grid">
      <section className="intro">
        <span className="eyebrow">Gestão financeira com contexto</span>
        <h1>Uma boa conversa começa com contexto<span>.</span></h1>
        <p className="lede">Queremos entender sua operação e o que pode funcionar melhor. Comece contando quem você é e qual empresa representa.</p>
        <ol className="journey">
          <li><span>01</span><div><strong>Seu ponto de partida</strong><p>Nome, contato e empresa em um só cadastro.</p></div></li>
          <li><span>02</span><div><strong>Uma conversa informada</strong><p>Pesquisa e briefing vão orientar o atendimento.</p></div></li>
          <li><span>03</span><div><strong>Um próximo passo claro</strong><p>Entender a necessidade e avaliar uma reunião.</p></div></li>
        </ol>
        <p className="notice">{enabled ? "O briefing é preparado antes da conversa. Falhas de integração aparecem no atendimento." : "Ambiente em preparação. O cadastro será liberado após configurar a persistência e a sessão segura."}</p>
      </section>
      <LeadFormComponent enabled={enabled} />
    </div>
  );
}
