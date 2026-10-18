# Execução assíncrona

Espaço reservado para adaptadores de fila e entrada do worker. A escolha do
executor depende da hospedagem e será feita quando os primeiros jobs forem
implementados. Não existe worker em execução nem um comando que simule sucesso.

O worker deverá chamar os mesmos casos de uso do servidor, validar o ambiente
sob demanda e persistir estado/idempotência. Não usar promises sem await ou
timers dentro de Route Handlers como fila durável.
