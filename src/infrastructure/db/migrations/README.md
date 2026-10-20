# Migrações

Migrações versionadas ficam nesta pasta. A aplicação não executa alterações no
Neon automaticamente. `001_lead_capture.sql` cria cadastro, submissão original e
eventos append-only. `002` a `006` criam pesquisa, jobs, voz, SPICED e agenda.
`007_neon_integrity.sql` adiciona vínculos por lead/execução e permite status
`conflict` no rastro das ferramentas. `008_conversation_processing.sql` adiciona
`conversation_processing_jobs`.

`pnpm db:status` consulta o plano sem alterar o banco. Para aplicar um plano
revisado, use `pnpm db:migrate -- --apply --expect-endpoint SEU_ENDPOINT`.
`DATABASE_URL_UNPOOLED` precisa apontar diretamente ao destino informado.
O executor usa transação, lock de migração, timeout e checksums em
`schema_migrations`. Arquivos aplicados não devem ser editados.

O cadastro e a submissão são atômicos, com lock por chave idempotente.
O enqueue grava pesquisa e job juntos em outra transação. Se esse segundo
passo falhar, o cadastro permanece preservado, a resposta indica falha e o
reenvio com a mesma chave retoma a preparação.

A migração `006_calendar_scheduling.sql` cria o histórico append-only de
`meeting_attempts`. Ela mantém ofertas, intenções, confirmações, conflitos e
incertezas sem armazenar o token bruto da oferta.

Para homologar a integração da agenda com credenciais configuradas:

- `GET /disponibilidade?de=&ate=` com `Authorization: Bearer <AGENDA_TOKEN>`;
- `POST /reunioes` com `{ inicio, nome, email }`;
- respostas 200/201/204, 409, timeout e falha de transporte;
- base `https://api.exemplo.com/agenda`, sem repetir `/agenda` nos caminhos.

Ao implementar o schema, use `DATABASE_URL_UNPOOLED` para migrações e teste em
uma branch isolada antes de aplicar ao banco de produção. Consultas de aplicação
usam `DATABASE_URL`. Repositórios usam transações não interativas via HTTP;
o executor de DDL usa Client pela conexão direta. Nenhum deles mantém transação
aberta durante chamada a provedores.
