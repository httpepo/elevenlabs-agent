export const objectionCategories = [
  "price_cost",
  "existing_erp",
  "non_decision_maker",
  "timing_no_time",
  "implementation_anxiety",
  "data_security",
  "human_interaction",
  "non_construction_sector",
] as const;

export type ObjectionCategory = typeof objectionCategories[number];
export type ObjectionResolutionStatus = "addressed" | "pending_specialist";

export type AuthorizedClaim = {
  id: string;
  text: string;
};

export type ObjectionDefinition = {
  category: ObjectionCategory;
  label: string;
  triggers: string[];
  authorizedClaims: AuthorizedClaim[];
  response: string;
  nextStep: string;
  limits: string;
  source: string;
  sourceVersion: string;
};

export const specialistFallback =
  "Não tenho essa informação específica no momento, mas vou registrá-la para que nosso especialista comercial esclareça durante a reunião.";

export const objectionCatalog: readonly ObjectionDefinition[] = [
  {
    category: "price_cost",
    label: "Preço ou custo",
    triggers: ["quanto custa", "é caro", "preço", "valor", "mensalidade", "desconto"],
    authorizedClaims: [
      { id: "price_not_documented", text: "As informações disponíveis não informam preço ou condição comercial." },
    ],
    response: "Eu não tenho um preço ou condição comercial para informar agora. Posso registrar sua dúvida e oferecer uma conversa com um especialista para avaliar o contexto da operação.",
    nextStep: "Entenda a preocupação e proponha uma conversa comercial se houver interesse.",
    limits: "Não invente preço, faixa, desconto, condição ou retorno garantido. Valores em telas de demonstração não são uma tabela de preços.",
    source: "policy/commercial-capabilities",
    sourceVersion: "2026",
  },
  {
    category: "existing_erp",
    label: "ERP ou sistema atual",
    triggers: ["já usamos erp", "já tenho erp", "não quero trocar", "outro sistema", "sistema atual"],
    authorizedClaims: [
      { id: "erp_integration_documented", text: "As informações disponíveis descrevem integração ao ERP." },
      { id: "open_finance_documented", text: "As informações disponíveis descrevem contas bancárias conectadas via Open Finance." },
    ],
    response: "A Atlas trabalha com integração ao ERP e conexão de contas bancárias via Open Finance. Um especialista pode confirmar a compatibilidade e o desenho adequado para sua operação.",
    nextStep: "Identifique o sistema utilizado e o que ainda exige trabalho manual.",
    limits: "Não confirme compatibilidade com um fornecedor específico nem prometa que trocar o sistema atual será necessário ou desnecessário; encaminhe a avaliação ao especialista.",
    source: "policy/commercial-capabilities",
    sourceVersion: "2026",
  },
  {
    category: "non_decision_maker",
    label: "Não é a pessoa decisora",
    triggers: ["não sou a pessoa certa", "não decido", "não sou decisor", "meu diretor decide", "preciso de aprovação"],
    authorizedClaims: [],
    response: "Entendo. Posso registrar seu papel e convidar você para uma demonstração de 30 minutos com as pessoas responsáveis pela decisão, se fizer sentido.",
    nextStep: "Registre quem participa da decisão e convide essas pessoas, sem pressionar.",
    limits: "Não desqualifique automaticamente pelo cargo nem invente critérios de exclusão.",
    source: "policy/icp-guidelines",
    sourceVersion: "2026-10-18",
  },
  {
    category: "timing_no_time",
    label: "Momento ou falta de tempo",
    triggers: ["estou sem tempo", "agora não", "não é o momento", "depois", "ocupado"],
    authorizedClaims: [],
    response: "Respeito seu momento. Posso encerrar agora ou, se preferir, ir direto à escolha de um horário de 30 minutos que seja conveniente para você.",
    nextStep: "Respeite o encerramento ou consulte a agenda somente após aceite explícito.",
    limits: "Não pressione nem prometa contato automático futuro que a aplicação não executa.",
    source: "policy/attendance-conduct",
    sourceVersion: "2026-10-16",
  },
  {
    category: "implementation_anxiety",
    label: "Receio de implantação",
    triggers: ["difícil de implantar", "implantação", "migração", "vai demorar", "parar a operação"],
    authorizedClaims: [
      { id: "data_import_documented", text: "As informações disponíveis descrevem importação de dados de outras plataformas." },
      { id: "erp_integration_documented", text: "As informações disponíveis descrevem integração ao ERP." },
      { id: "digital_account_opening_documented", text: "As informações disponíveis descrevem abertura de contas digitais por empreendimento em poucos minutos." },
    ],
    response: "A Atlas trabalha com importação de dados e integração ao ERP. Também é possível abrir contas digitais por empreendimento em poucos minutos. Não tenho um prazo de implantação específico; registro a dúvida para o especialista.",
    nextStep: "Identifique se a preocupação é prazo, equipe, migração ou sistema.",
    limits: "Abertura de conta em minutos não é implantação completa nesse prazo. Não prometa migração sem esforço ou sem interrupção.",
    source: "policy/commercial-capabilities",
    sourceVersion: "2026",
  },
  {
    category: "data_security",
    label: "Segurança e dados",
    triggers: ["meus dados", "segurança", "dados bancários", "é seguro", "certificação", "iso", "soc"],
    authorizedClaims: [
      { id: "open_finance_documented", text: "As informações disponíveis descrevem contas bancárias conectadas via Open Finance." },
      { id: "integrated_accounts_documented", text: "As informações disponíveis descrevem contas integradas ao produto." },
    ],
    response: "A Atlas conecta contas bancárias via Open Finance e trabalha com contas integradas ao produto. Eu não tenho uma certificação ou garantia específica para informar; registro essa pergunta para o especialista.",
    nextStep: "Registre a pergunta e encaminhe o detalhe ao especialista.",
    limits: "Não invente ISO, SOC, auditoria, garantia de segurança ou condição contratual.",
    source: "policy/commercial-capabilities",
    sourceVersion: "2026",
  },
  {
    category: "human_interaction",
    label: "Preferência por atendimento humano",
    triggers: ["você é um robô", "quero falar com uma pessoa", "pessoa de verdade", "atendimento humano"],
    authorizedClaims: [],
    response: "Eu sou o Anderson, da Atlas. Posso oferecer uma reunião com um especialista humano e verificar horários, se você quiser.",
    nextStep: "Acolha o pedido e consulte a agenda somente após aceite explícito.",
    limits: "Não finja ser humano. Se perguntarem se você é um robô, explique que é o Anderson, agente de voz da Atlas. Não prometa transferência imediata para outro canal.",
    source: "policy/attendance-conduct",
    sourceVersion: "2026-10-16",
  },
  {
    category: "non_construction_sector",
    label: "Setor fora da construção",
    triggers: ["não somos construtora", "fora da construção", "outro setor", "não atuamos com construção", "não somos incorporadora"],
    authorizedClaims: [],
    response: "A Atlas tem forte atuação em construção civil e incorporadoras. Não consigo confirmar aderência ao seu setor com as informações disponíveis; registro a pergunta para um especialista.",
    nextStep: "Registre a necessidade financeira e a dúvida sobre aderência.",
    limits: "Não exclua automaticamente pelo setor nem garanta aderência sem base autorizada.",
    source: "policy/commercial-capabilities",
    sourceVersion: "2026",
  },
] as const;

export function getObjectionDefinition(category: ObjectionCategory): ObjectionDefinition {
  const definition = objectionCatalog.find((item) => item.category === category);
  if (!definition) throw new Error(`Objeção não catalogada: ${category}.`);
  return definition;
}

export function matchObjectionCategory(statement: string): ObjectionCategory | null {
  const normalized = normalize(statement);
  const definition = objectionCatalog.find((item) => item.triggers.some((trigger) => normalized.includes(normalize(trigger))));
  return definition?.category ?? null;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

