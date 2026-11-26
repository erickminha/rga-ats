# RGA ATS — fechamento técnico de 5A e 5C

Base de integração `homolog`, commit `c4bb6d6739dc394dddf8c52a6a2e73142fb95b75`. Revisão dos PRs #31 a #36. As consultas à homologação foram somente leitura. Os testes de escrita usaram PostgreSQL local descartável e dados fictícios.

## 1. Problemas encontrados

- A execução diária `c4a38c50-182d-4041-972d-f8666d39415e` começou às 11h46min59s de Brasília em 26/11/2026. Durante a auditoria, seguia em execução com 2.154 linhas lidas, 1.561 pendentes e 9 erros. O contador de resumos da execução era 28, enquanto 657 registros no banco já tinham Texto CV. O número acumulado no banco inclui os textos persistidos até a consulta, sem atribuição individual àquela execução.
- Os nove erros de linha registrados eram de validação de telefone brasileiro. Os identificadores abaixo são do relatório de importação e as posições são do CSV intermediário de cada lote, sem relação direta com o número da linha em Sheets. O relatório não comprova se a origem contém telefone internacional, erro de entrada ou outra causa de formatação.
- A deduplicação diária retornava qualquer execução do mesmo dia, inclusive `FAILED`. O histórico podia mostrar pendências mesmo após terminar a varredura e não distinguia textos importados de resumos.
- Em homologação, havia 2.103 profissionais ativos, 2.102 autorizações vigentes, 2.102 referências com vínculo do Drive, 21 empresas e 38 vagas. Nenhuma vaga tinha `clientCompanyId`.

| Relatório interno | Posições no lote |
| --- | --- |
| `7b63a8c4-db2f-4ea4-a0dc-1e4c630e8407` | 21, 53, 69 |
| `0cd27b10-a558-40b7-8818-c94e2f05df67` | 71 |
| `eb035106-1430-4b81-949c-d5daa30687b3` | 65 |
| `e47796e3-1d01-44b6-852b-d168961e1a99` | 30, 48 |
| `460f7cf9-8d5a-4f2a-8701-7beaf9a56562` | 65, 94 |

## 2. Causas identificadas

- O agendador relia A:S em cada lote, processava novamente a seleção de todo o histórico e baixava o OCR completo. Prévia e confirmação consultavam tabelas que lotes sem vagas ou participações dispensavam. O diagnóstico `seq-scans` do Neon registrou 1.400 varreduras de `ImportRef` e 264 de `Contact`. São contadores cumulativos do banco. Eles não atribuem todas as varreduras à sincronização.
- O PR #36 gravava `cvText` e `cvHash` no JSON de `TalentSummary`. Um CV sem resumo criava uma linha com estado de resumo pronto. O worker legado substituía o JSON ao gerar um novo resumo. Isso podia apagar o OCR se a origem fosse alternada para o ATS. O Texto CV não alimentava a consulta principal do Assistente. As projeções públicas e as exportações revisadas não selecionavam esse JSON.
- A revisão do importador e da ficha de vaga mostrou que uma carga de vaga existente preenche dados faltantes, exceto `clientCompanyId`. O fluxo administrativo **Conciliar empresas das vagas históricas** já foi feito para preencher esse vínculo mediante prévia auditada. A ficha e os filtros da organização leem o vínculo persistido. O zero vem dos dados em homologação.
- A pesquisa do Assistente usava cargo/área e UF. O cargo de interesse não servia de evidência de experiência e a projeção de texto livre para um provedor externo podia conter identificação residual.

## 3. Correções realizadas

- A rotina usa cursor persistente e lê até 100 linhas completas por vez. A consulta global usa apenas a linha de cabeçalhos e as colunas de carimbo, arquivo e ID para conferir identidades entre páginas. O hash do índice detecta reordenação e mudança de identidade em linhas abrangidas. Anexos ao final da planilha são incorporados na próxima rodada. A prévia administrativa legada continua lendo a fonte em páginas durante a própria solicitação para calcular o lote e validar a confirmação.
- A gravação do lote, o OCR, os contadores e o avanço do cursor estão na mesma transação. A posse do lease é verificada dentro da transação. O lease pode ser recuperado após nove minutos. Falhas transitórias aguardam cinco e dez minutos, com limite de três tentativas consecutivas por página. Uma falha terminal permite nova diária no mesmo dia. A rota retorna estado da execução, `complete` e HTTP 503 em falha terminal. A rotina periódica continua processando o trabalho pendente.
- Cadastros históricos com ID e vínculo já conhecidos deixam de passar pela importação cadastral operacional. Ações da recrutadora preservam os campos preenchidos e vazios dos cadastros já identificados. Erros conhecidos permanecem consultáveis e a prévia administrativa permite reprocessar após corrigir a origem. IDs repetidos, arquivos repetidos e divergências de vínculo seguem para revisão. O histórico administrativo mostra até 100 linhas e motivos por execução, e relatórios novos de importação registram a linha correspondente na planilha. As decisões de consentimento usam o histórico da pessoa, inclusive revogações.
- A migração `20261126191500_rga_5a_sync_cv` cria `TalentCvText`, transfere o OCR existente dos cadastros autorizados, preserva resumos e revisões e remove os marcadores criados apenas para OCR. A ficha renderiza o texto integral como texto, com quebras de linha. Um hash independente evita regravação e permite atualizar versões. Células vazias, erros do OCR e conflitos de identidade preservam o texto válido já armazenado. Revogação e anonimização removem o conteúdo local.
- A mineração busca no PostgreSQL e traz trechos, tipo de evidência e link para a ficha. A classificação separa interesse, experiência registrada e menção no currículo. A pesquisa usa os termos e a UF e respeita organização, consentimento, retenção e confidencialidade. Os dados e perguntas reais dessa busca permanecem no ATS. O teste sintético administrativo do Groq mantém configuração, modelo, cotas e auditoria existentes.
- A abertura do Drive rejeita referências ambíguas. A entrega de versões arquivadas pelo ATS verifica organização, titular, retenção e revogação registrada. Respostas de arquivos, fichas e recuperação de senha recebem cache privado sem armazenamento.

### Prévia de conciliação das vagas

Conferência somente leitura de `Anuncios` (colunas A:C) contra as referências internas e empresas do Neon. A correspondência exige ID original único, cargo compatível e nome exato normalizado de uma única empresa da organização. Os nomes comerciais e os dados pessoais ficam nas fontes autorizadas.

| Resultado | Quantidade | Evidência |
| --- | ---: | --- |
| Correspondência inequívoca | 13 | Linhas 2, 5–10, 12–15, 17 e 19 de `Anuncios`. |
| ID ATS ausente em `Anuncios` | 21 | A conferência pelo código da aba `Acompanhamento de Vagas Clientes` encontrou zero referências exatas entre as 26 linhas com informação. |
| ID repetido em `Anuncios` | 1 | Requer identificar a versão correta na origem. |
| Cliente sem nome exato cadastrado | 2 | Linhas 16 e 20 de `Anuncios`. Requer validar identificador da empresa. |
| Vaga sem referência de importação | 1 | Requer comprovação manual. |

A área de dados A:C de `Controle de Vagas` retornou apenas o cabeçalho. A planilha também contém relações textuais sem ID de vaga verificável. Esses indícios podem orientar revisão manual. Para aplicar as correspondências confirmadas, use a prévia **Conciliar empresas das vagas históricas** com ID, título e cliente das linhas aprovadas. Confira a empresa na ficha após a autorização. Nenhum vínculo foi gravado.

## 4. Evidências de testes

Os comandos e resultados finais estão no PR. Chromium local em 1440 × 900 e 390 × 844 verificou a ficha, as quebras do OCR, o resumo anterior, o redirecionamento simulado do Drive, o PDF privado, a negação após revogação, a busca com link e o histórico. Outra organização recebeu negação para a ficha e para o download. Uma migração com dados fictícios no formato anterior preservou o OCR autorizado, o resumo revisado e o histórico do cursor, e excluiu o OCR do cadastro revogado. A validação usa PostgreSQL local descartável e não lê dados pessoais de homologação. As regressões cobrem página retomada após falha, diário após falha terminal, importação e atualização de OCR, revisão preservada, conteúdo inválido, revogação, isolamento por organização e exemplos de busca sem requisições ao provedor. A suíte de currículos valida pasta autorizada, escopo, idempotência, integridade e arquivo fictício.

## 5. Riscos residuais

- Os nove relatórios comprovam rejeição na validação de telefone. A correção do valor depende de evidência da origem. As referências dos lotes devem ser usadas em sessão administrativa. Evite copiar valores para tickets, mensagens ou logs.
- A paginação ainda consulta o índice global de identidade em cada execução de lote para impedir associação ambígua. O tamanho máximo de resposta do Google permanece 32 MB por chamada. Medir latência, bytes e frequência de consultas com a carga efetiva depois que a revisão estiver no ar. Busca de texto é lexical e as categorias de evidência dependem da redação do currículo. A análise da experiência cabe à recrutadora.
- Três amostras de currículos PDF no Drive apresentaram permissões individuais e nenhuma entrada pública na consulta de metadados da conta conectada. A conta Google do navegador da recrutadora decide a abertura. O Drive informa quando um original foi apagado ou o acesso foi retirado. Revogar no ATS impede novas aberturas a partir do sistema. Permissões Google, cópias já baixadas e backups exigem controle próprio.
- O R2 de homologação tem domínio `r2.dev` desativado, sem domínio personalizado. A política do bucket observada aborta multipart após sete dias. A aplicação autentica a transferência ao S3/R2 no servidor e transmite o download pela sessão ATS. Use o tempo de expiração da sessão e revogação do ATS como limites desse acesso. O repositório contém ensaios de formato, tamanho, análise de malware e exclusão pendente. A disponibilidade do scanner e a política de retenção no bucket ainda precisam de teste operacional.
- O projeto Neon publica janela de restauração de seis horas e tem branches de cópia de homologação. A auditoria local confirmou a aplicação das migrações. Ainda é necessário ensaiar restauração em branch isolada e conferir retenção e inventário do R2.

## 6. Configurações que dependem do administrador

| Controle | Evidência e critério de aceite |
| --- | --- |
| Cloud Scheduler e Secret Manager | A execução no Neon comprova que o serviço iniciou o processamento real. Confirmar no projeto os dois agendamentos existentes, o OIDC da conta dedicada, audiência, versão vinculada do segredo, papéis mínimos e política de tentativas. O código ainda aceita o segredo legado de cron quando configurado. |
| Cloudflare WAF e origem Cloud Run | A zona tem inventário de regras gerenciadas e SSL `full`. A consulta ao nome proposto de homologação não retornou registro específico. Os pontos de entrada de WAF gerenciado e personalizado, rate limiting e cache consultados na zona retornaram HTTP 404, portanto a aplicação dessas proteções no host efetivo segue sem evidência. Validar o host efetivo, TLS, bypass de cache e proteção da origem com o administrador antes de alterar regras, DNS ou IAM. |
| Autenticação, recuperação e MFA | O ATS invalida sessões antigas e aplica limites persistidos para login e recuperação. Confirmar entrega do e-mail, política de MFA administrativa via Workspace e tratamento das contas com senha. O ATS não impõe segundo fator próprio. |
| Armazenamento e retenção | Com a conta da recrutadora, abrir uma amostra autorizada e confirmar negação após revogação, acesso negado a outra organização e tratamento de um arquivo indisponível. Confirmar no Cloud Run a referência R2 e o ClamAV atualizado e testar upload fictício, arquivo bloqueado, descarte e downloads privados. |
| Groq | Confirmar o teste sintético na revisão implantada, o ZDR administrativo, o modelo `openai/gpt-oss-120b` e as cotas existentes. A busca profissional local não precisa de token. |
| Gestão de dados | Autorizar separadamente os 13 vínculos, revisar os 25 casos pendentes e corrigir telefones na origem com evidência. Definir a política de backup, restauração, retenção e permissões do Drive. |

## 7. Procedimento de rollback

1. Antes da implantação aprovada em homologação, registre revisão, migração e horário de corte. Drene a execução ativa da versão anterior com a administração, preserve a referência de backup e gere uma cópia anterior à migração conforme a política de retenção. A migração preserva contadores de execuções legadas interrompidas e encerra essas execuções com `checkpoint_version` para que uma nova rodada possa começar pelo cursor inicial.
2. Em regressão, interrompa o processamento pela operação aprovada no Cloud Run/Scheduler e mantenha a revisão de código anterior disponível. Preserve a tabela `TalentCvText` e os dados novos. A revisão anterior só lê OCR dentro de `TalentSummary.content`. Se precisar recuperar essa apresentação no rollback, valide em cópia isolada a reidratação dos campos legados a partir do texto autorizado, com autorização para a escrita e preservação de resumos revisados. A revisão anterior exige cuidado com novas revogações porque desconhece a tabela nova.
3. Compare migrações, contagens, cursor, consentimentos, amostras fictícias de arquivo e integridade antes de voltar a processar. Uma restauração integral pode descartar alterações feitas após o ponto de corte. Exige aceite e conciliação de alterações posteriores, sem alterar o bucket histórico do Drive.

## 8. Pendências que impedem o aceite

- Validar a primeira rodada completa na revisão de homologação, a execução diária seguinte, a importação correta do Texto CV, a abertura autenticada pela recrutadora e a recuperação após falha observada.
- Obter evidência de permissões da origem Cloud Run, configuração e disponibilidade do ClamAV, entrega da recuperação de senha, MFA e ensaio de restauração.
- Aprovar a prévia de empresas e resolver pendências de identidade e telefone com base na origem. Lotes já processados e dados reais seguem sujeitos à conferência administrativa.
