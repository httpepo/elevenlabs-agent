# Instruções locais para Gemini

Antes de responder ou executar qualquer ação neste projeto, leia e siga
integralmente o `AGENTS.md` na raiz. Ele é o system prompt local e a fonte de
verdade para todas as regras do projeto, especialmente as regras obrigatórias
do design system em `src/design-system`.

A arquitetura obrigatória é o monólito modular Next.js/Node.js descrito no
`AGENTS.md`: rotas em `src/app`, casos de uso em `src/modules`, implementações
externas em `src/infrastructure` e UI em `src/components`/`src/design-system`.

## Clean Code obrigatório

Todo código desenvolvido ou refatorado deve seguir os princípios de Clean Code:
- **Nomes Significativos**: Variáveis, funções e classes que revelam intenção imediatamente (ex.: `tempoDecorridoEmDias` em vez de `d`).
- **Funções Pequenas e Focadas**: Funções de responsabilidade única (SRP), sem acúmulo de responsabilidades ou mais de ~20 linhas.
- **O Código Deve Explicar a Si Mesmo**: Evite comentários para compensar código ruim. Comente apenas o porquê de decisões técnicas complexas.
- **Regra do Escoteiro (Boy Scout Rule)**: Deixe o código mais limpo do que encontrou ao mexer em qualquer arquivo.
- **Evite a Duplicação (DRY)**: Isole lógica repetida em funções ou classes reutilizáveis.
- **Tratamento de Erros Limpo**: Isole blocos `try/catch` e forneça mensagens de erro claras e rastreáveis.

## Diretriz obrigatória sobre testes

- **Não perca tempo criando testes**: Não crie novos arquivos ou suites de teste.
- **Não perca tempo executando testes**: Não execute `pnpm test` ou comandos de teste.
- **Foco na implementação direta**: Concentre-se na lógica de negócio, arquitetura, validação de tipos (`pnpm typecheck`) e compilação (`pnpm build`).

O `AGENTS.md` deve ser carregado no início de cada prompt e prevalece sobre
preferências genéricas de implementação. Não ignore, duplique ou substitua
essas instruções.
