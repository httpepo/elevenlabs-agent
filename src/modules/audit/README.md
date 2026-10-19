# Audit

O módulo mantém o read model sanitizado do painel interno. `ToolExecution` e
`sanitizePayload` preservam o rastro de chamadas sem gravar tokens, chaves ou
segredos. A entidade valida o vínculo obrigatório com lead/execução, o status,
a duração e a data antes de aceitar um registro; o payload é sanitizado no
domínio e novamente na fronteira de leitura.

`GetLeadAuditSummary` compõe a visão por `leadId` e `executionId`, sem misturar
tentativas. O painel recebe somente DTOs de leitura e não tem operações de
mutação.

`FileAuditRepository` lê os registros locais dos módulos de pesquisa, voz,
qualificação e agenda; `NeonAuditRepository` consulta `tool_executions` em
produção. O painel é somente leitura. Webhooks continuam sob responsabilidade
do módulo de conversa e não há inbox/outbox ou event bus ativo neste setup.
