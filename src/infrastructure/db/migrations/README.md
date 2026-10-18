# Migrações

Local reservado para migrações versionadas. Este setup não define tabelas nem
executa alterações no Neon. Preserve o driver existente até decidir como
implementar os repositórios; nenhum ORM foi escolhido ou instalado nesta etapa.

Ao implementar o schema, use `DATABASE_URL_UNPOOLED` para migrações e teste em
uma branch isolada antes de aplicar ao banco de produção. Consultas de aplicação
usam `DATABASE_URL`. O cliente atual usa HTTP; a implementação de Unit of Work
deverá respeitar as capacidades transacionais do driver escolhido.
