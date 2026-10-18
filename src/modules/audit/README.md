# Audit

Limite reservado para rastreabilidade e deduplicação. A implementação futura
cria `domain/` para execuções/eventos, `ports/` para armazenamento append-only
e `application/` para registro e processamento. Jobs e webhooks usam as regras
de `skills/atlas-reliability/SKILL.md`, a partir da raiz do projeto.

Não há inbox/outbox, processamento de webhook ou event bus ativo neste setup.
