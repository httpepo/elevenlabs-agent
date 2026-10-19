import Image from "next/image";
import Link from "next/link";
import atlasLogo from "@/design-system/assets/brand/atlas-white.svg";

const repositoryUrl = "https://github.com/httpepo/elevenlabs-agent";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer" aria-label="Rodapé">
      <span className="footer-glow" aria-hidden="true" />
      <div className="footer-container">
        <FooterMain />
        <FooterBar year={year} />
      </div>
    </footer>
  );
}

function FooterMain() {
  return (
    <div className="footer-navigation">
      <div className="footer-brand-column">
        <Link href="/" className="footer-brand" aria-label="Atlas · início">
          <Image src={atlasLogo} alt="Atlas" width={102} height={20} />
        </Link>
        <p className="footer-summary">
          Agente de qualificação comercial por voz com pesquisa pré-call, SPICED e agendamento integrado.
        </p>
      </div>
      <nav className="footer-column" aria-labelledby="footer-app-title">
        <h3 id="footer-app-title">Aplicação</h3>
        <ul className="footer-links">
          <li><Link href="/">Atendimento</Link></li>
          <li><Link href="/painel">Painel interno</Link></li>
        </ul>
      </nav>
      <nav className="footer-column" aria-labelledby="footer-project-title">
        <h3 id="footer-project-title">Projeto</h3>
        <ul className="footer-links">
          <li>
            <a href={repositoryUrl} target="_blank" rel="noopener noreferrer">
              GitHub · httpepo/elevenlabs-agent
            </a>
          </li>
        </ul>
      </nav>
    </div>
  );
}

function FooterBar({ year }: { year: number }) {
  return (
    <div className="footer-legal">
      <div className="footer-legal-bar">
        <span className="footer-copyright">Projeto autoral de Pedro Sudario © {year}</span>
        <a
          className="text-link"
          href={repositoryUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Código-fonte no GitHub <span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>
  );
}
