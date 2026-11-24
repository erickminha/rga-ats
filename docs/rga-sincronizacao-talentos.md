# Sincronização do Banco de Talentos

Em **Configurações → Dados → Importações**, use **Consultar alterações na planilha**. A leitura usa os cabeçalhos da aba de respostas. Revise os totais e os erros, confirme o lote e consulte sua execução no histórico. Cada lote inclui até 100 registros novos ou alterados. Uma alteração nos dados entre a prévia e a confirmação exige outra prévia.

O ATS identifica registros pelo ID da origem e usa o importador de planilhas existente. Cada linha confirmada recebe uma impressão dos campos mapeados. O histórico e os marcadores são gravados na mesma transação. Uma repetição retoma nas linhas ainda pendentes. Linhas com erro podem ser reprocessadas pelo botão após correção. IDs vazios ou repetidos permanecem na origem para revisão. Ausências na planilha preservam os registros no ATS. Edições locais prevalecem sobre dados de origem em campos já preenchidos.

## Configuração da homologação

- Defina `RGA_TALENT_SYNC_ORG_ID` com o ID da organização existente e `RGA_TALENT_SHEET_ID` com o ID da fonte histórica.
- Injete o JSON da conta de serviço de leitura em `RGA_GOOGLE_SERVICE_ACCOUNT` por referência ao Secret Manager. Compartilhe exclusivamente a fonte necessária como leitora. A aplicação solicita o escopo de leitura de planilhas.
- Para autorizar a execução diária, indique uma conta administrativa ativa da organização com `RGA_TALENT_SYNC_ADMIN_ID` e defina `RGA_TALENT_SYNC_DAILY=true` após o aceite da prévia inicial. A configuração padrão deixa essa rotina desligada.
- No agendador de homologação, configure um POST diário a `/api/cron/rga-talentos`, com a autenticação existente por `CRON_SECRET`. Configure tentativas com intervalo crescente para respostas 503. Uma execução processa um lote. O JSON informa quantas alterações ainda aguardam e quantas linhas carecem de ID confiável.
- Esta sincronização trata os campos cadastrais mapeados, sem importar o documento do Drive, conceder aceites ou disparar comunicações. A origem suporta até 5.000 linhas e 8 MB de resposta JSON. Os documentos pessoais continuam sujeitos aos controles próprios de acesso, armazenamento e retenção.
