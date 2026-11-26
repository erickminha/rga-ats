# Matriz de aceite operacional da RGA

A matriz reúne a revisão original de 24/11/2026 e a atualização dos ciclos 5B e 5C de 26/11/2026. A situação se refere ao fluxo completo descrito no plano revisado. Os testes locais usam registros fictícios. Para elevar uma linha a **Validada em homologação**, registrar a revisão do Cloud Run, o perfil utilizado, a operação executada e o resultado observado. **Aprovada para produção** exige aceite expresso da RGA.

| Entrega | Funcionalidade | Situação | Evidência disponível ou verificação pendente |
| --- | --- | --- | --- |
| 5A | Identidade, navegação, lista e Kanban | Implementada, mas não testada | Chromium local, desktop e mobile, com painel lateral e filtro por vaga |
| 5A | Inclusão coletiva do banco de talentos | Implementada parcialmente | Duas inclusões autorizadas no teste local. Falta conciliar as preferências históricas |
| 5A | Cadastro de empresas e vagas | Implementada, mas não testada | Conferir abertura de vaga vinculada a cliente na revisão publicada |
| 5A | Portal público de vagas | Implementada, mas não testada | Publicação e ocultação de rascunho verificadas localmente |
| 5A | Consentimentos históricos | Implementada parcialmente | PR #17. Prévia e confirmação testadas em PostgreSQL local. Lote real aguarda evidência e autorização |
| 5A | Visualização de currículo | Implementada, mas não testada | PR #18. PDF fictício consultado em desktop e celular. Aceite na revisão de homologação pendente |
| 5A | Sincronização do Banco de Talentos | Implementada parcialmente | PR #19. Botão e processamento incremental testados. Faltam configuração do agendamento e validação com a identidade do serviço |
| 5A | Recuperação privada dos documentos do Drive | Implementada parcialmente | PR #20. Confirmação individual e em lote com fontes simuladas. Faltam transferência aprovada e conferência no R2 real |
| 5A | Conciliação de vagas, empresas e histórico de seleção | Implementada parcialmente | PR #21. Conciliação por ID da vaga, cargo e empresa testada. Reconstrução das seleções aguarda correspondências comprovadas |
| 5B | Ficha provisória e entrevista por competências | Validada localmente | Três entrevistas fictícias. A ficha oficial aguarda conferência com o modelo vigente da RGA. |
| 5B | DISC provisório e acompanhamento | Validada localmente | Convite, cálculo, revisão e parecer interno com dados fictícios. |
| 5B | DISC nativo para uso real | Implementada sem validação | A liberação depende da chave, metodologia e licença aprovadas pela administração. |
| 5B | Parecer, comparação, apresentação e retorno | Validada localmente | Três finalistas, pareceres em PDF, envio registrado, retorno e aprovação separados da contratação. |
| 5B | Referências profissionais | Validada localmente | Autorização, tentativas, questionário, conclusão, revogação e isolamento. |
| 5C | Funil e acompanhamento operacional | Validada localmente | Lista, Kanban, filtros por empresa, vaga e responsável, movimentação em lote, histórico e indicadores. |
| 5C | Vagas, anúncios e fontes registradas | Validada localmente | Empresa vinculada, publicação, candidatura em celular, PNG e impressão PDF. |
| 5C | Modelos WhatsApp e orientações sobre documentos | Validada localmente | Modelos por organização, prévia e registro manual. O canal de recebimento de documentos depende da administração. |
| 5C | Agenda de entrevistas e tarefas | Validada localmente | Agendamento com hora de Brasília e pendências na central existente. |
| 5D | Propostas, contratos e precificação | Não implementada | Validar proposta com parâmetros da RGA, aceite e congelamento dos termos |
| 5D | Financeiro por vaga, faturamento, NF e cobranças | Não implementada | Conferir valores contratados, vencimento, baixa e histórico |
| 5D | Garantia e reposição | Não implementada | Validar prazos contratuais e vínculo da reposição com a contratação original |
| 5E | Ficha admissional e controle de documentos | Não implementada | Validar acesso restrito e distinguir aprovação do início efetivo |
| 5E | Desempenho e acompanhamento em 30/90 dias | Não implementada | Validar prazos configuráveis, responsável e histórico |
| 5F | Jornada integral da consultoria | Não implementada | Aceite depende das etapas anteriores e de simulação em desktop e celular |

O estado “Implementada, mas não testada” se refere ao aceite na revisão publicada. As evidências locais do PR #16 estão em [evidências do PR](evidencias-pr16/).

A simulação integrada usou uma conta administrativa local, uma fonte de planilha simulada e um PDF fictício. O navegador confirmou a importação cadastral, a prévia em lote de currículos e a criação da versão privada. [Prévia cadastral em desktop](evidencias-5a/rga-m5a-preview-desktop.jpg) · [Confirmação de currículo no celular](evidencias-5a/rga-m5a-preview-mobile.jpg)

## DISC nativo e parecer

| Funcionalidade | Situação | Evidência ou condição de aceite |
| --- | --- | --- |
| Convite e questionário nativo | Implementada, mas não testada em homologação | Link com expiração e rascunho no servidor. Confirmação de publicação pendente |
| Pontuação e interpretação | Implementada parcialmente | Instrumento provisório restrito a registros fictícios na organização de teste. Uso real depende da validação explícita da RGA |
| Central DISC e preenchimento do parecer | Implementada parcialmente | Pontuações, revisão e emissão reaproveitam a ficha e o editor. Administração de provedores e recálculo auditado permanecem pendentes |

A jornada local com PostgreSQL descartável e Chromium confirmou o convite em desktop, os dez grupos respondidos em tela de 390 × 844, a revisão, o preenchimento do parecer e o download do PDF versionado. [Questionário no celular](evidencias-disc/questionario-mobile.jpg) · [Revisão no desktop](evidencias-disc/revisao-desktop.jpg)

### Complemento de auditoria
Interpretação local gerada no envio, revisão textual editável com controle de concorrência, auditoria da interpretação e seleção do DISC nativo revisado para preenchimento do parecer sem sobrescrever o DISC legado. Seções de instrumentos, referências e verificações complementares incluídas. Integração dos SVGs RGA na navegação, incluindo Central DISC. A chave continua provisória, sem liberação real. Validação da versão consolidada permanece pendente.

Administração de IA com modelos autorizados, cotas por organização e globais, cache de interpretação, histórico de tentativas, teste sintético, circuito temporário e prévia PDF de rascunho. Recálculo administrativo cria registro separado com nova chave aprovada. Testes adicionais incluídos, sem execução independente nesta revisão.

## Produtividade operacional — 5C

Anúncios estruturados a partir dos dados da vaga, prévia editável, texto, PNG e impressão/PDF; sete modelos de WhatsApp, agendamento preenchido e registro de envio manual. Assistente direto separado do DISC, com configuração explícita de provedor/credencial, cotas persistidas, fontes locais e teste sintético. A validação operacional permanece pendente; ainda faltam personalização central dos modelos, rastreamento de origem de anúncios e mineração com currículos reais. A chave Groq não foi configurada na infraestrutura durante esta alteração. Consulte `docs/rga-prod-5c.md`.

## Ciclo 5C.2

Em 26/11/2026, o Neon de homologação informou 2.103 profissionais, 2.036 elegíveis pela autorização vigente, 67 sem autorização vigente identificada, 21 empresas, 38 vagas, zero currículos principais ou versões históricas vinculadas e zero execuções registradas da sincronização anterior. O endereço do serviço respondeu com o commit `5a775b5`. O acesso à credencial do provedor, o agendamento e a próxima execução no Scheduler aguardam validação no projeto.

| Funcionalidade | Situação | Evidência |
| --- | --- | --- |
| Resumo persistido, revisável e pesquisável | Implementada, mas não testada | Percurso local com PostgreSQL descartável, resumo cadastral e exibição em desktop |
| Sincronização manual pela recrutadora | Implementada, mas não testada | Percurso local em celular com planilha simulada e histórico persistente |
| Sincronização diária, retomada e consumo de IA | Implementada parcialmente | Endpoints autenticados disponíveis no código. Falta configurar e testar no Google Cloud |

[Resumo em desktop](evidencias-5c2/resumo-desktop.jpg) · [Sincronização em celular](evidencias-5c2/sincronizacao-mobile.jpg) · [Configuração operacional](rga-sincronizacao-talentos.md)

## Fechamento operacional dos ciclos 5B e 5C

A revisão mais recente da jornada, a situação por funcionalidade, as evidências locais e o roteiro para a Rayane estão no [relatório de fechamento operacional](rga-fechamento-5b-5c-operacional.md).
