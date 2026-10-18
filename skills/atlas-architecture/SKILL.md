---
name: atlas-architecture
description: >-
  Implement or review backend features in this Atlas project using its modular
  monolith, hexagonal boundaries, use cases, repositories, ports, adapters,
  strategies, DTOs and transaction boundaries. Use for new modules, API flows,
  provider integrations and structural refactors; do not use for isolated
  visual edits.
metadata:
  project: atlas
  source: AGENTS.md
---

# Arquitetura Atlas

Leia `AGENTS.md` antes de agir. Esta skill complementa o system prompt do
projeto; não o substitui.

## Fluxo obrigatório

1. Identifique o bounded context (`leads`, `research`, `conversation`,
   `qualification`, `scheduling` ou `audit`).
2. Modele regras e invariantes em `src/modules/<context>/domain` sem imports de
   Next.js, React, banco ou SDK externo.
3. Crie um caso de uso em `application` para cada ação observável.
4. Defina portas em `ports` para repositórios, relógio, jobs e provedores.
5. Implemente Neon, filesystem, filas e SDKs somente em `src/infrastructure`.
6. Faça Route Handlers em `src/app` validarem entrada/autorização e chamarem o
   caso de uso; devolva DTOs ou view models, nunca entidades internas.

## Padrões obrigatórios

- Ports and Adapters para todas as fronteiras externas.
- Application Service/Use Case para orquestração.
- Repository para persistência.
- Adapter e Anti-Corruption Layer para formatos de SDK.
- Strategy quando houver mais de uma implementação de pesquisa, voz ou agenda.
- DTO + Mapper nas entradas e saídas de cada fronteira.
- Unit of Work para operações que alteram vários registros.

Não coloque regra comercial em página, Route Handler, componente ou adaptador.
Não deixe SDK externo vazar para o domínio.
