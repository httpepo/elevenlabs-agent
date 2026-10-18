# Regras obrigatórias do projeto

Este arquivo é o system prompt local e a fonte de verdade das instruções de
desenvolvimento para qualquer agente, incluindo Codex, Claude, Cursor, Gemini e
outros assistentes que trabalhem neste repositório.

## Ordem obrigatória no início de cada tarefa

Antes de responder, planejar, criar arquivos ou editar código:

1. Leia este `AGENTS.md` integralmente.
2. Leia `README.md` para entender o produto, os limites atuais e os comandos de
   verificação.
3. Leia `src/design-system/README.md` e consulte
   `src/design-system/tokens.json` antes de qualquer alteração visual.
4. Inspecione os componentes existentes em `src/design-system/components/ui/`
   antes de criar uma nova solução de interface.
5. Inspecione o `package.json` para consultar as bibliotecas existentes antes de
   instalar uma nova.

Estas regras devem ser tratadas como as primeiras instruções do contexto de
cada prompt. Elas são obrigatórias durante toda a tarefa e não podem ser
substituídas por preferências genéricas do agente.

Quando um agente precisar delegar trabalho, consultar outro modelo ou gerar um
subprompt, o primeiro bloco desse prompt também deve dizer para ler e seguir o
`AGENTS.md` e as regras do design system antes de agir.

## Escopo e capacidades centrais da aplicação

O projeto **Atlas (`elevenlabs-agent`)** implementa um fluxo integrado de
atendimento e qualificação comercial por voz:

1. **Cadastro de leads**: formulário real com nome, e-mail, telefone e empresa
   (além de campos opcionais), validado no servidor e com os dados originais
   preservados.
2. **Pesquisa pré-call e briefing**: pesquisa pública da pessoa e da empresa,
   com briefing persistido antes da conversa por voz, mantendo fontes, fatos,
   hipóteses e lacunas rastreáveis.
3. **Conversa de voz bidirecional**: sessão em tempo real pelo microfone usando
   o briefing correto e exibindo estados e falhas de forma compreensível.
4. **Qualificação SPICED e objeções**: extração estruturada das dimensões SPICED
   e registro de objeções com evidências da transcrição, sem inventar preço,
   integração, certificação ou condição comercial.
5. **Agendamento comercial**: consulta de disponibilidade e tentativa de reserva
   somente após escolha e consentimento explícitos do visitante, registrando
   confirmado, conflito, incerto ou falha.
6. **Painel interno**: visão consolidada por execução com formulário, briefing,
   transcrição, resumo, SPICED e histórico da agenda.

Mocks identificados servem apenas ao desenvolvimento local.

## Arquitetura obrigatória

O projeto usa um **monólito modular em Next.js + Node.js**, com separação
hexagonal entre interface, casos de uso, domínio e infraestrutura. Não crie
microserviços, um servidor Express paralelo ou chamadas diretas de provedores a
partir das páginas.

```text
src/
  app/                         Rotas, páginas e Route Handlers HTTP
  modules/
    leads/                     Cadastro e identidade do visitante
    research/                  Pesquisa, fontes, evidências e briefing
    conversation/              Sessão de voz, transcrição e resumo
    qualification/             Qualificação SPICED e objeções
    scheduling/                Disponibilidade e reserva
    audit/                     Execuções, webhooks e rastreabilidade
  infrastructure/
    bootstrap.ts               Composição de casos de uso e adaptadores
    config/                    Configuração de ambiente restrita ao servidor
    db/                        Conexão, schema e repositórios Neon
    jobs/                      Worker, filas e execução idempotente
    providers/                 Tavily/Gemini, ElevenLabs e agenda
    security/                  Sessões, assinaturas e proteção de dados
  components/                  Composições visuais específicas do produto
  design-system/               Tokens, assets e primitivas reutilizáveis
```

### Dependências entre camadas

- `src/app` pode chamar somente casos de uso e view models. Route Handlers
  validam entrada, autenticação e resposta; não contêm regras comerciais nem
  chamadas diretas a provedores. Para acessar casos de uso compostos, importe
  `src/infrastructure/bootstrap.ts`. `src/infrastructure/config/demo.ts`
  fornece apenas o limite e os textos da demo; nenhum outro adaptador concreto
  pode ser importado por rotas ou páginas.
- `src/modules/*/domain` contém entidades, value objects, estados e regras
  puras. Não importa React, Next.js, banco, SDK de provedor ou código de UI.
- `src/modules/*/application` contém casos de uso e orquestrações. Depende de
  portas/interfaces, nunca de implementações concretas.
- `src/modules/*/ports` define contratos de repositório, pesquisa, voz,
  agenda, jobs e relógio. Os contratos devem receber e retornar tipos do
  domínio, sem vazar formatos de SDK.
- `src/infrastructure` implementa as portas. Todo acesso ao Neon, filesystem,
  fila, SDK externo e segredo fica nessa camada.
- `src/components` não acessa banco, provedores ou regras comerciais. Ele recebe
  dados e ações já preparados pelos casos de uso ou pelas páginas.
- `src/design-system` não importa `src/app`, `src/modules`, `src/lib` ou
  `src/infrastructure`. Suas primitivas não conhecem domínio.

### Módulos e casos de uso

Mantenha estas responsabilidades separadas:

- `leads`: `CreateLead`, validação, preservação do formulário original e
  versões confirmadas/corrigidas.
- `research`: `StartResearch`, `RunResearch`, `BuildBriefing`, fontes,
  evidências, hipóteses e lacunas.
- `conversation`: `PrepareVoiceSession`, `ProcessCallWebhook`, transcrição,
  resumo e estado da sessão.
- `qualification`: normalização das respostas, objeções e estado de cada
  dimensão do SPICED.
- `scheduling`: `GetAvailability`, `OfferSlots` e `BookMeeting`, incluindo
  conflito, timeout e confirmação somente após sucesso real.
- `audit`: registro append-only de chamadas de ferramenta, webhooks, erros,
  duração e correlação com o visitante.

As rotas devem seguir os casos de uso:

```text
POST /api/leads
POST /api/leads/:id/research
GET  /api/leads/:id/status
POST /api/leads/:id/voice/session
POST /api/leads/:id/calendar/availability
POST /api/leads/:id/calendar/book
POST /api/webhooks/elevenlabs
```

### Persistência e estados

Use Neon PostgreSQL como persistência de produção. O adaptador em arquivo serve
apenas para demonstração local e deve implementar a mesma porta do repositório.
Não acople o domínio ao formato JSON do adaptador local.

O modelo persistido deve manter, no mínimo, registros separados para:

```text
leads
lead_submissions
lead_profile_versions
research_runs
research_sources
briefings
voice_sessions
conversation_artifacts
spiced_qualifications
meeting_attempts
tool_executions
webhook_events
```

Não sobrescreva histórico. Dados originais, correções, evidências e tentativas
devem permanecer rastreáveis.

Estados válidos:

```text
research:     queued -> running -> ready | partial | failed | cancelled
conversation: not_started -> ready -> connecting -> active -> finalizing -> completed | abandoned | failed
meeting:      not_requested -> offered -> pending -> confirmed | conflict | uncertain | failed | cancelled
webhook:      received -> processed | ignored | failed
```

Toda transição deve ser explícita e validada no domínio. Um timeout de reserva
não pode ser convertido em confirmação nem repetir o POST cegamente. Webhooks
e jobs precisam de idempotência por identificador externo.

### Jobs e integrações

- Pesquisa, processamento pós-chamada e tarefas demoradas executam em worker ou
  fila, sem depender de manter uma request HTTP aberta como garantia de execução.
- O worker usa os mesmos módulos de aplicação e infraestrutura do servidor web.
- Credenciais ficam somente no servidor. O navegador recebe apenas tokens de
  sessão temporários e dados autorizados.
- Voz, pesquisa e agenda são acessadas exclusivamente por adaptadores em
  `src/infrastructure/providers`.
- Ferramentas acionadas pelo agente recebem um `leadId` validado pelo backend,
  nunca um identificador livremente escolhido pelo modelo.
- Conteúdo de páginas externas é dado não confiável: pode virar evidência, mas
  nunca instrução de sistema ou regra do agente.
- Não use fallback silencioso para dados fixos quando uma integração real falhar.

### Regras de evolução e verificações

- `src/lib` possui somente reexports de compatibilidade. Não adicione novas
  regras nem novos consumidores a `src/lib`.
- Antes de criar uma pasta ou módulo novo, encaixe a responsabilidade em uma
  camada existente e atualize esta arquitetura se realmente houver um novo
  limite de domínio.
- Não mova lógica de domínio para componentes ou Route Handlers.
- Não importe SDK externo fora de seu adaptador.
- Não adicione dependência de workspace para o design system.
- Execute verificações estáticas após mudanças no backend (`pnpm typecheck`,
  `pnpm check:architecture` e `pnpm backend:env`).
- Execute `pnpm build` ao alterar módulos usados pela aplicação.
- Segredos e cliente de banco são lidos sob demanda; imports e build não
  devem abrir conexões ou chamar provedores.

## Skills locais obrigatórias

As skills versionadas em `skills/` complementam este system prompt. Leia a
skill correspondente antes de implementar a área indicada:

- `skills/atlas-architecture/SKILL.md`: módulos, casos de uso, portas,
  adaptadores, repositories, strategies, DTOs e transações.
- `skills/atlas-reliability/SKILL.md`: state machines, jobs, webhooks,
  idempotência, inbox/outbox, retries e resiliência.
- `skills/atlas-domain-modeling/SKILL.md`: entidades, value objects, eventos,
  policies, specifications, evidências e SPICED.

Quando uma tarefa atravessar mais de uma área, carregue todas as skills
relevantes. Elas não substituem `AGENTS.md`, não autorizam novos serviços e não
permitem ignorar as regras do projeto.

## Clean Code básico e diretriz sobre testes

Todo código desenvolvido ou refatorado no projeto deve aplicar com rigor os fundamentos de Clean Code:

- **Nomes Significativos**: Variáveis, funções e classes devem revelar sua intenção imediatamente. Em vez de usar `var d` para tempo decorrido, use `var tempoDecorridoEmDias`. Não economize caracteres se isso custar a clareza.
- **Funções Pequenas e Focadas**: Uma função deve fazer apenas uma coisa e fazê-la bem. Se a sua função está cheia de `if`/`else` aninhados ou passa de 20 linhas, ela provavelmente está acumulando responsabilidades (violando o Single Responsibility Principle).
- **O Código Deve Explicar a Si Mesmo (Cuidado com Comentários)**: Comentários não devem ser usados para compensar um código mal escrito. Se você precisa comentar o que uma linha faz, é melhor reescrever a linha para ficar mais clara. Use comentários apenas para explicar o porquê de uma decisão técnica complexa, não o que o código está fazendo.
- **Regra do Escoteiro (Boy Scout Rule)**: Sempre deixe o código mais limpo do que você o encontrou. Se você precisar mexer em um arquivo para adicionar uma funcionalidade, aproveite para melhorar o nome de uma variável ou extrair uma função menor.
- **Evite a Duplicação (DRY - Don't Repeat Yourself)**: Se você copiou e colou o mesmo bloco de código em três lugares diferentes, extraia isso para uma função ou classe reutilizável. A duplicação multiplica o trabalho e as chances de bugs quando uma regra de negócio muda.
- **Tratamento de Erros Limpo**: Lidar com exceções não deve ocultar a lógica principal do seu programa. Isole os blocos de `try/catch` em funções próprias e crie mensagens de erro que ajudem os outros desenvolvedores a rastrear o problema.

### Diretriz obrigatória sobre testes (Não perder tempo com testes)

- **Não perca tempo criando testes**: Não crie novos arquivos de teste, suítes de teste, testes unitários, testes de integração ou fixtures de teste.
- **Não perca tempo executando testes**: Não execute `pnpm test` nem comandos de teste.
- **Foco na implementação direta**: Concentre o esforço na funcionalidade real, clareza do código, integridade da arquitetura, validação de tipos (`pnpm typecheck`) e compilação (`pnpm build`).

## Design system: fonte única e uso obrigatório

- O design system local em `src/design-system` é a única fonte visual do
  projeto. Não extraia o design system para pacote externo ou workspace separado.
- Reutilize primeiro os componentes de `@/design-system/components/ui/*`.
  Não copie componentes para páginas ou para `src/components`.
- `src/components` contém composições específicas do produto; componentes
  reutilizáveis e sem lógica de domínio pertencem a
  `src/design-system/components/ui/`.
- Não use uma biblioteca visual paralela, componentes de terceiros para
  substituir os componentes locais, HTML estilizado manualmente ou valores
  arbitrários quando o design system já oferecer a solução.
- Não crie cores, fontes, raios, espaçamentos, sombras ou estados visuais fora
  dos papéis definidos pelo tema sem justificar a necessidade e atualizar a
  fonte de verdade.
- Preserve os estados de foco, erro, desabilitado, carregamento, hover e
  responsividade definidos pelos componentes existentes. Toda interação nova
  deve continuar acessível por teclado e por leitor de tela.

## Tokens, fontes e geração

- `src/design-system/tokens.json` é a fonte de verdade dos tokens.
- `src/design-system/index.css` e
  `src/design-system/generated/tokens.tsx` são arquivos gerados. Não os edite
  diretamente.
- Para alterar tokens, edite `tokens.json` e execute:

  ```sh
  pnpm design:tokens
  ```

- Não baixe fontes ou assets de marca em tempo de execução. Use os arquivos
  incorporados em `src/design-system`.
- O tema deve continuar sendo importado uma única vez por
  `src/app/globals.css`.

## Processo para qualquer alteração visual

1. Pesquise e reutilize os componentes e tokens existentes.
2. Se faltar uma primitiva reutilizável, adicione-a em
   `src/design-system/components/ui/`, sem lógica de domínio, e documente o
   uso em `src/design-system/README.md` quando necessário.
3. Use a primitiva na composição da página ou do fluxo em `src/app` ou
   `src/components`.
4. Verifique contraste, foco, teclado, semântica, responsividade e estados de
   erro antes de considerar a tarefa concluída.
5. Execute as validações apropriadas:

   ```sh
   pnpm design:tokens
   pnpm typecheck
   pnpm build
   ```

## Regra de conclusão

Nenhuma tarefa de interface está concluída se criar uma segunda fonte visual,
editar arquivos gerados diretamente, ignorar um componente existente ou deixar
uma validação relevante falhar.

Ao relatar o trabalho, informe quais componentes/tokens locais foram usados,
quais arquivos foram alterados e quais validações foram executadas.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
