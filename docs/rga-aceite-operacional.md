# Matriz de aceite operacional da RGA

Atualização de 24/11/2026. A situação se refere ao fluxo completo descrito no plano revisado. Os testes locais usam registros fictícios. Para elevar uma linha a **Validada em homologação**, registrar a revisão do Cloud Run, o perfil utilizado, a operação executada e o resultado observado. **Aprovada para produção** exige aceite expresso da RGA.

| Entrega | Funcionalidade | Situação | Evidência disponível ou verificação pendente |
| --- | --- | --- | --- |
| 5A | Identidade, navegação, lista e Kanban | Implementada, mas não testada | Chromium local, desktop e mobile, com painel lateral e filtro por vaga |
| 5A | Inclusão coletiva do banco de talentos | Implementada parcialmente | Duas inclusões autorizadas no teste local. Falta conciliar as preferências históricas |
| 5A | Cadastro de empresas e vagas | Implementada, mas não testada | Conferir abertura de vaga vinculada a cliente na revisão publicada |
| 5A | Portal público de vagas | Implementada, mas não testada | Publicação e ocultação de rascunho verificadas localmente |
| 5A | Consentimento e histórico de seleção | Implementada parcialmente | ImportRef e prévia existentes. Falta conciliação com evidência e confirmação do lote |
| 5A | Currículos históricos e sincronização diária | Implementada parcialmente | Armazenamento privado e versões no código. Falta conciliar arquivos e testar retomada |
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
