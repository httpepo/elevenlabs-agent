# Design system local

Esta pasta é a camada visual incorporada à aplicação. Ela não é um pacote
externo nem um workspace separado.

## Organização

- `tokens.json`: fonte de verdade dos papéis de cor, tipografia, espaçamento e raio.
- `scripts/build-tokens.mjs`: regenera `index.css`, `generated/tokens.tsx`, `public/downloads/atlas-tokens.dtcg.json` e o favicon base.
- `index.css`: tema Tailwind 4 consumido uma única vez por `src/app/globals.css`.
- `components/ui/`: primitivas reutilizáveis, sem lógica de domínio.
- `assets/brand/`: logos e ícone adaptativo da marca Atlas usados pela aplicação.
- `references/`: fontes incorporadas e metadados de tokens usados pelo gerador.

As páginas ficam em `src/app`, composições específicas em `src/components` e
as regras de negócio em `src/modules`. Banco, configuração e integrações ficam
em `src/infrastructure`. Componentes do design system não devem acessar dados,
rotas ou integrações.

Para alterar tokens:

```sh
pnpm design:tokens
```

Depois, valide com `pnpm typecheck` e `pnpm build`.


## Rodapé autoral

`src/components/site-footer.tsx` compõe o rodapé enxuto do projeto autoral,
reutilizando o logo local, tipografia, espaçamentos e o papel decorativo
`footerGlow` (`--footer-glow`) definido em `tokens.json`. O efeito usa
gradientes CSS estáticos, sem canvas, fontes remotas ou animações. Texto, links
e bordas usam `foreground`, `muted-foreground` e `border`.
