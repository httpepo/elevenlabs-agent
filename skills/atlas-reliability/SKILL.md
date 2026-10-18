---
name: atlas-reliability
description: >-
  Build or review asynchronous jobs, webhooks and external provider workflows
  in the Atlas project with explicit state machines, idempotency, inbox/outbox,
  retries, timeouts and conflict-safe scheduling. Use for research, voice
  callbacks, calendar booking and provider failures.
metadata:
  project: atlas
  source: AGENTS.md
---

# Confiabilidade dos fluxos Atlas

Leia `AGENTS.md` antes de agir. Use esta skill junto com
`skills/atlas-architecture/SKILL.md` quando a tarefa também alterar camadas ou
contratos.

## Estados

Modele transições explícitas e rejeite transições inválidas:

```text
research:     queued -> running -> succeeded | partial | failed
conversation: ready -> active -> processing -> completed | aborted | failed
meeting:      idle -> offering -> booking -> booked | conflict | unknown
webhook:      received -> processed | ignored | failed
```

Persista a transição e sua causa. Não trate ausência de dados como sucesso.

## Jobs e webhooks

- Dê a cada job e evento uma chave de idempotência estável.
- Grave o evento recebido antes de processá-lo quando a entrega puder ser
  repetida; use inbox para deduplicar.
- Use outbox para publicar eventos depois do commit da transação.
- Jobs devem ser retomáveis, observáveis e seguros para retry.
- Webhooks devem validar assinatura, guardar o identificador externo e ocultar
  credenciais dos logs e do painel.

## Provedores e agenda

- Aplique timeout, retry somente quando a operação for segura e limite de
  tentativas por provedor.
- Reserva confirmada exige resposta de sucesso real da API.
- HTTP 409 vira `conflict` e dispara nova consulta de disponibilidade.
- Timeout de reserva vira `unknown`; não repita o POST cegamente.
- Registre cada chamada em `tool_executions`, incluindo falha, duração e
  correlação com `leadId` e execução.

Não mantenha pesquisas ou processamento de webhook dependentes de uma request
HTTP aberta; use worker/fila por trás dos casos de uso.
