# Atlas · Voice SDR & SPICED Qualification

Projeto autoral de **Pedro Sudario** para atendimento comercial B2B por voz:
recebe um visitante, pesquisa pessoa e empresa em segundo plano, sintetiza um
briefing estruturado, conduz a conversa por voz em tempo real, extrai a
qualificação SPICED e agenda reuniões mediante confirmação explícita. O painel
interno consolida evidências, transcrição, resumo, objeções e histórico de
ferramentas por execução.

- [Repositório](https://github.com/httpepo/elevenlabs-agent)

Stack: Next.js, React e TypeScript, com persistência Neon PostgreSQL, pesquisa
Tavily, síntese e extração Gemini, voz ElevenLabs e Vercel Queues.

## Fluxo da aplicação

1. O visitante informa nome, e-mail, telefone e empresa; site e número de
   funcionários são opcionais. O servidor preserva os dados originais e a versão
   normalizada.
2. A pesquisa roda em segundo plano, registra fontes públicas e gera o briefing
   com fatos, hipóteses e lacunas. Sem briefing válido, a sessão de voz permanece
   bloqueada.
3. A tela de preparação exibe o progresso, confirma “Tudo pronto!” e habilita o
   botão “Iniciar conversa por voz”. Falhas oferecem nova tentativa.
4. A conversa por voz abre com indicador visual animado, transcrição em tempo
   real e controles de microfone e encerramento. A sessão recebe fatos e lacunas
   do briefing correspondente.
5. O agente Anderson conduz a qualificação consultiva e pode consultar a agenda e
   reservar um horário escolhido explicitamente pelo visitante. Falha ou timeout
   de reserva nunca é tratado como confirmação.
6. Ao encerrar, a interface aguarda a finalização no backend e exibe a mensagem
   de conclusão do atendimento.
7. O encerramento cria um job persistente que recupera os artefatos da conversa
   na ElevenLabs sem depender exclusivamente do webhook. O webhook assinado
   também salva artefatos e aciona o mesmo job. O painel interno exibe pesquisa,
   transcrição, resumo, qualificação SPICED, objeções, ferramentas e tentativas
   de agendamento.

O pós-processamento tem meta de 60 segundos, com tentativas retomáveis e
indicação explícita de atraso após esse prazo. Transcrição e resumo recebidos são
preservados antes da extração com Gemini.

## Execução local

Use o Node definido em `.nvmrc` e o `pnpm` configurado em `package.json`:

```sh
nvm use
pnpm install --frozen-lockfile
cp -n .env.example .env
pnpm dev
```

Acesse `http://127.0.0.1:3000`. Para processar pesquisas fora da Vercel,
mantenha o worker em outro terminal:

```sh
nvm use
pnpm jobs:worker
```

Para o pós-processamento local das conversas, execute também:

```sh
pnpm jobs:conversation
```

Na Vercel, os consumers `/api/queues/research` e `/api/queues/conversation`
recebem jobs em `gru1` nos tópicos `atlas-research` e
`atlas-conversation-processing`, com estado e bloqueios persistidos no Neon.

### Persistência e segurança

- Em desenvolvimento, `APP_MODE=demo` libera o fluxo local.
- Com `DATABASE_URL`, a composição utiliza Neon PostgreSQL. Sem ela, os
  adaptadores em arquivo usam `.data/` apenas para demonstração local.
- Falha do Neon nunca ativa fallback silencioso em arquivo.
- Em produção, `APP_MODE=live`, banco e `LEAD_SESSION_SECRET` habilitam o fluxo
  público com sessão assinada por visitante (`atlas_lead_session`).
- O painel interno (`/painel`) usa HTTP Basic com `PANEL_USERNAME` e
  `PANEL_PASSWORD`.
- Ferramentas de agenda usam credencial temporária de 15 minutos vinculada a
  lead, execução e sessão de voz; cada oferta de horário possui token próprio com
  validade de 10 minutos.

### Variáveis de ambiente

| Capacidade | Variáveis |
| --- | --- |
| Neon | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH` |
| Pesquisa e extração | `TAVILY_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Voz | `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_WEBHOOK_SECRET`, `LEAD_SESSION_SECRET` |
| Agenda | `AGENDA_BASE_URL`, `AGENDA_TOKEN`, `AGENDA_AUTH_HEADER`, `AGENDA_AUTH_PREFIX` |
| Painel | `PANEL_USERNAME`, `PANEL_PASSWORD` |

Use `.env.example` como referência. Credenciais permanentes permanecem restritas
ao servidor; nunca utilize `NEXT_PUBLIC_` para segredos.

### Banco de dados

Para verificar conexão, plano e checksums das migrações:

```sh
pnpm db:check
pnpm db:status
```

Para aplicar novas migrações após revisar o destino:

```sh
pnpm db:migrate -- --apply --expect-endpoint SEU_ENDPOINT
```

## Configuração do agente de voz

Configuração esperada na ElevenLabs:

- Persona `Anderson` (Atlas) e idioma `pt-br`, com saudação inicial, prompt base
  e descrições de ferramentas sincronizados automaticamente na ElevenLabs pelo
  backend antes de emitir o token WebRTC (ou manualmente via `pnpm voice:sync`).
- Variável dinâmica `{{spiced_prompt}}` com fatos verificados, lacunas e mapa
  estruturado de objeções.
- `initial_wait_time=2`, turno `patient`, `speculative_turn=false` e
  estabilidade `0.72`.
- Ferramentas `consultar_disponibilidade` (`tool-availability.json`),
  `reservar_reuniao` (`tool-booking.json`) e `end_call`.
- Webhook pós-chamada apontando para `/api/webhooks/elevenlabs` com validação de
  assinatura HMAC e deduplicação.

## Verificações estáticas e build

```sh
pnpm check:architecture
pnpm backend:env
pnpm typecheck
pnpm build
```

## Arquitetura

Monólito modular em Next.js + Node.js, com separação hexagonal entre interface
(`src/app`, `src/components`), aplicação e domínio (`src/modules`), portas e
infraestrutura (`src/infrastructure`), além do design system incorporado em
`src/design-system`. Consulte [AGENTS.md](AGENTS.md) para os contratos entre
camadas.
