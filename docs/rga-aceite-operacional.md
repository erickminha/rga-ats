# Matriz de aceite operacional da RGA

Atualização de 24/11/2026. A situação se refere ao fluxo completo descrito no plano revisado. Os testes locais usam registros fictícios. Para elevar uma linha a **Validada em homologação**, registrar a revisão do Cloud Run, o perfil utilizado, a operação executada e o resultado observado. **Aprovada para produção** exige aceite expresso da RGA.

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
| 5B | Ficha de seleção e entrevista por competências | Implementada parcialmente | Roteiro existente. Falta validar uso dentro da central da vaga |
| 5B | Aplicação e acompanhamento do DISC | Implementada parcialmente | Registro de resultado e PDF por participação. Identificar instrumento licenciado e validar envio, prazo e retorno |
| 5B | Parecer profissional, comparação e apresentação de finalistas | Implementada parcialmente | Edição, PDF e compartilhamento existentes. Simular três finalistas e retorno do cliente |
| 5B | Controle de referências profissionais | Não implementada | Validar autorização, finalidade e acesso ao registro |
| 5C | Anúncios, WhatsApp e solicitação de documentos | Implementada parcialmente | Portal e comunicação por e-mail existentes. Validar modelos e operação diária |
| 5C | Agenda de entrevistas | Implementada, mas não testada | Agendar e conferir na central da vaga com o perfil de recrutadora |
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
