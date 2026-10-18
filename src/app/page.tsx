import { LeadFormComponent } from "@/components/lead-form";
import { isLocalDemo } from "@/infrastructure/config/demo";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const enabled = isLocalDemo();
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
        <p className="notice">{enabled ? "Demonstração local · sem chamadas a serviços externos." : "Ambiente em preparação. O cadastro está disponível apenas durante o desenvolvimento local."}</p>
      </section>
      <LeadFormComponent enabled={enabled} />
    </div>
  );
}
