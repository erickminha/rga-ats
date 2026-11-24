# Sincronização do Banco de Talentos

Em **Configurações → Dados → Importações**, use **Consultar alterações na planilha**. A leitura usa os cabeçalhos da aba de respostas. Revise os totais e os erros, confirme o lote e consulte sua execução no histórico. Cada lote inclui até 100 registros novos ou alterados. Uma alteração nos dados entre a prévia e a confirmação exige outra prévia.

O ATS identifica registros pelo ID da origem e usa o importador de planilhas existente. Cada linha confirmada recebe uma impressão dos campos mapeados. O histórico e os marcadores são gravados na mesma transação. Uma repetição retoma nas linhas ainda pendentes. Linhas com erro podem ser reprocessadas pelo botão após correção. IDs vazios ou repetidos permanecem na origem para revisão. Ausências na planilha preservam os registros no ATS. Edições locais prevalecem sobre dados de origem em campos já preenchidos.

## Configuração da homologação

- Defina `RGA_TALENT_SYNC_ORG_ID` com o ID da organização existente e `RGA_TALENT_SHEET_ID` com o ID da fonte histórica.
- Injete o JSON da conta de serviço de leitura em `RGA_GOOGLE_SERVICE_ACCOUNT` por referência ao Secret Manager. Compartilhe exclusivamente a fonte necessária como leitora. A aplicação solicita o escopo de leitura de planilhas.
- Para autorizar a execução diária, indique uma conta administrativa ativa da organização com `RGA_TALENT_SYNC_ADMIN_ID` e defina `RGA_TALENT_SYNC_DAILY=true` após o aceite da prévia inicial. A configuração padrão deixa essa rotina desligada.
- No agendador de homologação, configure um POST diário a `/api/cron/rga-talentos`, com a autenticação existente por `CRON_SECRET`. Configure tentativas com intervalo crescente para respostas 503. Uma execução processa um lote. O JSON informa quantas alterações ainda aguardam e quantas linhas carecem de ID confiável.
- Esta sincronização trata os campos cadastrais mapeados, sem importar o documento do Drive, conceder aceites ou disparar comunicações. A origem suporta até 5.000 linhas e 8 MB de resposta JSON. Os documentos pessoais continuam sujeitos aos controles próprios de acesso, armazenamento e retenção.

## Cópia privada de um currículo histórico

A ficha do talento oferece **Conferir currículo da planilha original** para administradores da organização configurada. O ATS cruza a referência de importação com o ID original e verifica na API do Drive se o documento pertence diretamente à pasta autorizada. A prévia apresenta a versão e o tamanho. A confirmação tem validade de 15 minutos. O vínculo exige consentimento vigente para armazenamento do perfil e cadastro sem bloqueio de retenção.

A conta de serviço precisa de permissão de leitura na pasta histórica; a aplicação pede o escopo Drive somente leitura para consultar metadados e baixar o arquivo. Em homologação, configure `RGA_RESUME_FOLDER_ID` e `RGA_RESUME_R2_BUCKET`. O nome autorizado deve coincidir com `S3_BUCKET`. Use o adaptador S3, o endpoint privado autenticado do R2 e as referências do Secret Manager para suas credenciais. Mantenha desativados o domínio público do bucket e os domínios personalizados. Configure o verificador de malware privado exigido pelos uploads em produção.

O arquivo original permanece no Drive. O ATS valida conteúdo, tamanho e integridade antes de vincular o documento, extrai o texto pelos mecanismos existentes e registra a proveniência da versão. Conteúdo idêntico já copiado para a mesma pessoa é ignorado. Alterações de conteúdo geram outra versão e preservam o currículo principal existente e os documentos de cada seleção. Referências ambíguas, atalhos, arquivos fora da pasta e formatos incompatíveis exigem revisão.

Em **Importações → Conciliação de currículos do Drive**, a prévia apresenta até cinco documentos por vez. A busca cruza os IDs do lote inteiro, exclui vínculos ambíguos e conta as pessoas sem autorização. Confirme a cópia ou confira os próximos cinco documentos. Após interrupção, gere outra prévia. Cada confirmação bem-sucedida registra um marcador; se a conexão cair entre a gravação e o marcador, a impressão do conteúdo evita repetir a versão. Use a ficha individual para conferir uma nova versão publicada posteriormente no mesmo arquivo do Drive. Um link novo na origem volta a aparecer como pendente.
