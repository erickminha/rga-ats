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

## Operação no ciclo 5C.2

O botão **Banco de talentos → Sincronizar banco de talentos** está disponível aos perfis de recrutamento. Ele registra a solicitação em `TalentSyncRun` e inicia o primeiro lote em segundo plano. A rotina diária utiliza o mesmo processamento e os mesmos marcadores de importação. O painel mostra o estado configurado no ATS e o histórico de execuções, inclusive quando a planilha retorna sem alterações. A rotina periódica de processamento retoma os lotes pendentes e a fila de resumos.

Em homologação, a auditoria encontrou 2.103 profissionais ativos, 2.036 elegíveis pela autorização vigente, 67 sem autorização vigente identificada, zero currículos principais e zero sincronizações registradas pelo importador. As verificações de autenticação do serviço com Sheets e Groq e a configuração do Cloud Scheduler aguardam acesso administrativo ao projeto.

### Comandos de homologação

A conta Google de leitura precisa ser leitora da planilha de origem. Vincule o JSON dessa conta por referência a um segredo. Use uma conta administrativa ativa no ATS para `RGA_TALENT_SYNC_ADMIN_ID` e o ID da organização para `RGA_TALENT_SYNC_ORG_ID`. A identidade OIDC do Scheduler deve pertencer ao projeto e é separada da credencial de leitura do Sheets.

Consulte os agendamentos existentes na região. Reutilize os jobs que já apontem para os endpoints abaixo, com `gcloud scheduler jobs update http`. Os comandos `create` servem para quando a auditoria confirmar que não existe um job equivalente. O operador autenticado precisa de acesso para configurar o serviço, administrar os jobs e usar a conta de serviço indicada.

```bash
project=rga-ats-homolog
region=us-west1
service=rga-ats
origin="$(gcloud run services describe "$service" --project "$project" --region "$region" --format='value(status.url)')"
gcloud scheduler jobs list --project "$project" --location "$region" \
  --format='table(name,state,schedule,timeZone,httpTarget.uri)'

gcloud run services update "$service" --project "$project" --region "$region" \
  --update-env-vars="RGA_TALENT_SYNC_ORG_ID=${RGA_ATS_ORG_ID},RGA_TALENT_SYNC_ADMIN_ID=${RGA_ATS_SYNC_ADMIN_ID},RGA_TALENT_SHEET_ID=${RGA_ATS_SHEET_ID},RGA_TALENT_SYNC_DAILY=true,RGA_TALENT_SCHEDULER_EMAIL=${RGA_ATS_SCHEDULER_EMAIL},RGA_TALENT_SCHEDULER_AUDIENCE=${origin}" \
  --update-secrets="RGA_GOOGLE_SERVICE_ACCOUNT=${RGA_ATS_SHEETS_SECRET}:latest"

gcloud scheduler jobs create http rga-talentos-diario \
  --project "$project" --location "$region" --schedule='0 3 * * *' --time-zone=America/Sao_Paulo \
  --uri="${origin}/api/cron/rga-talentos" --http-method=POST \
  --oidc-service-account-email="$RGA_ATS_SCHEDULER_EMAIL" --oidc-token-audience="$origin"

gcloud scheduler jobs create http rga-talentos-processar \
  --project "$project" --location "$region" --schedule='*/5 * * * *' --time-zone=America/Sao_Paulo \
  --uri="${origin}/api/cron/rga-talentos-processar" --http-method=POST \
  --oidc-service-account-email="$RGA_ATS_SCHEDULER_EMAIL" --oidc-token-audience="$origin"
```

Ative a rotina diária após validar a origem e aprovar a primeira execução real. Consulte o job no Scheduler e confira o histórico no ATS. A janela exibida na interface é a configurada no código. O console do agendador é a fonte da próxima execução efetiva.

### Resumos profissionais

A ficha exibe o resumo salvo, oferece geração sob demanda, atualização de status, cópia e revisão. A geração local está disponível sem Groq. `RGA_SUMMARY_AUTO=true` enfileira dados novos ou alterados nos fluxos integrados. `RGA_SUMMARY_PAUSED=true` pausa o worker. A rotina não agenda uma carga inicial histórica.

Ative `RGA_SUMMARY_ALLOW_GROQ=true` somente após confirmar a finalidade autorizada e os limites da conta. A rotina reusa o provedor Groq do Assistente RGA configurado pelo Secret Manager. Configure `RGA_SUMMARY_DAILY_LIMIT` inicialmente em 20 e informe `RGA_GROQ_DAILY_REQUESTS` e `RGA_GROQ_DAILY_TOKENS` dentro dos limites verificados da conta. O worker pega um resumo por vez, aplica backoff e utiliza a projeção profissional reduzida. O orçamento compartilhado reserva uma estimativa conservadora de tokens por requisição. A auditoria registra os tokens informados pelo provedor nas gerações concluídas. A revogação remove o resumo e a fila daquele cadastro.


### Fonte de resumo: planilha (novembro de 2026)

A coluna S (ResumoCurriculo) é lida na mesma consulta A:S. O resumo completo é salvo no TalentSummary, com fonte PLANILHA, provider sheets e zero tokens no ATS. A narrativa pode ser revisada sem apagar os campos detalhados; a busca utiliza o texto integral. Campos vazios, ERRO:, conteúdo incompatível e identidades ambíguas não substituem resumos válidos. O hash evita regravação. A rotina requer consentimento vigente, exclui contatos anonimizados, bloqueados ou confidenciais e confere o vínculo do Drive.

Para a organização RGA configurada, a fonte padrão é a planilha. Definir RGA_SUMMARY_SOURCE=ats restaura a modalidade anterior. Em modo sheet, a fila de geração interna fica suspensa; o Assistente RGA não é alterado. Cada rodada importa até 100 resumos novos/alterados, incluindo linhas sem mudança cadastral. A rotina diária usa o agendamento existente, com continuidade de lotes pelo processador.

Os IDs originais prevalecem. Respostas de formulário sem ID podem reutilizar o vínculo único de Drive já conciliado. Para novas respostas com aceite explícito, documento único e data posterior ao marco histórico RGA_TALENT_DRIVE_ID_FROM, a rotina usa um ID determinístico baseado no arquivo; registros anteriores sem vínculo ficam para revisão, evitando recriar cadastros antigos. O marco da carga histórica conferida é 2026-11-24T16:48:53Z (13h48min53s em São Paulo). O termo precisa corresponder ao texto previamente verificado; revogação nunca é revertida pela sincronização.

Depois da aprovação do build e implantação em homologação, execute `bash scripts/activate-rga-sheet-sync.sh` no Cloud Shell autenticado. O script preserva a credencial existente de leitura do Sheets, ou exige o nome do segredo RGA_ATS_SHEETS_SECRET caso ela não esteja configurada. Reutiliza jobs equivalentes, habilita a janela diária às 03h e a continuidade a cada 5 minutos, e solicita uma primeira execução. Confira o resultado no histórico do ATS. A geração na planilha continua dependendo da autorização verificável pelo Apps Script; não preencha aceites em nome de candidatos.
