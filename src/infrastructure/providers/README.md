# Adaptadores externos

Os contratos já estão em `src/modules/*/ports/`. As futuras implementações
ficam nesta pasta, agrupadas por provedor:

- `tavily/`: busca e evidências.
- `gemini/`: briefing e extração estruturada.
- `elevenlabs/`: sessão WebRTC, verificação e conversão dos eventos recebidos.
- `calendar/`: tradução do contrato da agenda comercial.

`calendar/http-calendar-provider.ts` implementa o cliente HTTP da agenda com
`fetch`, sem SDK adicional. Usa `GET disponibilidade` e `POST reunioes`,
relativos à `AGENDA_BASE_URL`, e o cabeçalho `Authorization: Bearer`.
O cliente não acrescenta `/agenda` à URL base. A configuração é lida sob demanda.

A porta recebe e devolve tipos do domínio: não repassa o payload externo de
reserva. HTTP 409 retorna conflito; falha de transporte, timeout, resposta
pendente e erro do servidor não confirmam a reunião nem repetem o POST.
Uma resposta final HTTP 200/201/204 é traduzida para confirmação do início
solicitado. A URL real da agenda está configurada no ambiente local; o status e o
corpo exatos de sucesso ainda precisam ser homologados, sem interpretar um
payload externo como parte do domínio.

O adaptador tem testes isolados de contrato. Ainda não está conectado a casos
de uso, rotas, persistência de tentativas ou auditoria de chamadas. O futuro
fluxo `BookMeeting` precisa validar a escolha contra a oferta persistida,
registrar transições/tentativas e, após conflito, consultar novas opções.
Nenhuma reserva remota é criada ao importar o adaptador ou executar os testes.

Os outros provedores continuam sem implementação. Ao implementar, verificar
a documentação oficial atual e converter respostas para os tipos do domínio.
