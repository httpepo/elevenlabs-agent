# Adaptadores externos

Os contratos estão em `src/modules/*/ports/`. As implementações concretas
ficam nesta pasta, agrupadas por provedor:

- `research/`: busca Tavily e síntese de briefing Gemini.
- `qualification/`: extração estruturada SPICED com Gemini.
- `elevenlabs/`: sessão WebRTC, resultados pós-chamada e verificação de eventos.
- `calendar/`: tradução do contrato HTTP da agenda comercial.

`calendar/http-calendar-provider.ts` implementa o cliente HTTP da agenda com
`fetch`, sem SDK adicional. Usa `GET disponibilidade` e `POST reunioes`,
relativos à `AGENDA_BASE_URL`, e o cabeçalho `Authorization: Bearer`.
O cliente não acrescenta `/agenda` à URL base. A configuração é lida sob demanda.

A porta recebe e devolve tipos do domínio: não repassa o payload externo de
reserva. HTTP 409 retorna conflito; falha de transporte, timeout, resposta
pendente e erro do servidor não confirmam a reunião nem repetem o POST.
Uma resposta final HTTP 200/201/204 é traduzida para confirmação do início
solicitado, sem interpretar um payload externo como parte do domínio.
