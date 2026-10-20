# Execução assíncrona

Pesquisa: `atlas-research`, `/api/queues/research`, `job_queue`; localmente,
`pnpm jobs:worker`.

Pós-chamada: `atlas-conversation-processing` em `gru1`, `/api/queues/conversation`,
`conversation_processing_jobs`; localmente, `pnpm jobs:conversation`. A mensagem
contém só o ID da sessão. O worker recupera artefatos pela API da ElevenLabs se
necessário e extrai SPICED com idempotência por chamada. O job mantém tentativas,
último erro e lease de 55 segundos; a atualização usa o identificador do dono
do lease. O banco coordena tentativas imediatas com `after` e entregas da fila.

O encerramento enfileira o job antes de depender de webhook. Consultas de status
e painel autenticado recuperam jobs pendentes. Meta de 60 segundos, com atraso
explícito após esse prazo, sem prometer disponibilidade externa. Falha de voz
permanece independente do estado da extração. Os mesmos casos de uso são usados
na Vercel e no worker local.
