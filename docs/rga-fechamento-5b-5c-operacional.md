# Fechamento operacional dos ciclos 5B e 5C

Base de integração `homolog`, commit `c4bb6d6739dc394dddf8c52a6a2e73142fb95b75`. A revisão usa dados fictícios em PostgreSQL 16 descartável. A matriz abaixo se refere às funcionalidades desta entrega. O aceite da Rayane e a aprovação institucional da RGA dependem da revisão publicada em homologação.

## Funcionalidades, correções e situação

| Funcionalidade | Situação | Resultado ou condição para avançar |
| --- | --- | --- |
| Empresas, vaga vinculada e publicação | Validada localmente | Cadastro e publicação no fluxo da recrutadora. A empresa ficou oculta na prévia e no portal sem autorização de divulgação. |
| Anúncio e origem | Validada localmente | Prévia editável, PNG, impressão em PDF, portal e candidatura móvel. Distribuição lê a fonte gravada, traduz o canal do portal e conta separadamente registros sem fonte. O PNG conserva seus limites de tamanho e avisa quando a versão deve usar PDF. |
| Funil, etapas e participações | Validada localmente | Lista, Kanban, filtros por empresa, vaga e responsável, movimentação individual e coletiva, justificativa e histórico. Finalistas continuam elegíveis após renomear a etapa quando seu papel operacional foi preservado. |
| Acompanhamento da vaga, agenda e tarefas | Validada localmente | A central existente reúne entrevistas de hoje e futuras, tarefas com prazo, prazos de candidatura, inatividade, referências, DISC, parecer, envio, retorno e aprovação. Contadores de participações usam a mesma condição dos respectivos filtros. |
| Ficha provisória e entrevista | Validada localmente | Dados profissionais existentes aparecem na ficha da participação. Triagem, roteiro, evidências e recomendação continuam vinculados à participação. Agendamento manual e mensagens automáticas de confirmação usam o horário de Brasília. |
| Ficha oficial da RGA | Implementada sem validação | Existe a estrutura provisória. A paridade depende do formulário vigente e dos critérios abaixo. |
| DISC provisório | Validada localmente | Convite individual, expiração, rascunho, envio único, cálculo conhecido, interpretação local, revisão humana e síntese no parecer interno. A simulação fica restrita à organização de teste e e-mails `.invalid`. Testes da IA usam respostas simuladas. |
| DISC nativo para uso real | Implementada sem validação | A liberação depende da chave e da autorização formais. O instrumento permanece restrito à simulação enquanto não houver chave aprovada. |
| Reaproveitamento de DISC | Validada localmente | O reaproveitamento manual usa o resultado registrado na ficha, inclusive a cópia da revisão nativa real quando disponível. Exige autorização, finalidade e validade. O registro e o PDF existentes permanecem na participação original. |
| PDF avulso do DISC nativo | Não implementada | O resultado nativo pode ser consultado na Central DISC e a síntese revisada pode compor o parecer interno. Relatórios em PDF de instrumentos externos continuam no fluxo de anexos existente. |
| Referências profissionais | Validada localmente | Autorização, contato, questionário, fonte, revisão, histórico, revogação e isolamento. Dados e seção de referências ficam fora da projeção pública do parecer. |
| Verificações complementares | Validada localmente | A seção opcional do parecer aceita registro manual com finalidade profissional, referência da autorização e fundamento. O PDF compartilhado exclui essa seção. O fundamento e os casos de uso dependem da administração. |
| Parecer, PDF e comparação | Validada localmente | Preenchimento a partir da ficha, entrevista, DISC revisado e trechos de referências. A prévia usa o rascunho salvo. A emissão preserva versão e autoria. A comparação permite três finalistas. |
| Apresentação, envio e decisão | Validada localmente | Link com revisão, expiração e revogação. Criação do link, confirmação manual do envio, resposta da empresa e contratação são eventos distintos. Aprovação permanece na participação após movimentação. |
| WhatsApp por organização | Validada localmente | Modelos administrados em **Configurações → E-mail**, incluindo convites, referências, retorno, aprovação, encerramento e orientação sobre documentos. A prévia é editável. O convite DISC usa o link individual e a confirmação manual do envio. O transporte real aguarda homologação. |
| E-mail, recuperação de senha e convites de equipe | Validada localmente | Recuperação exercitada com SMTP simulado. Convites de equipe entregam uma senha temporária à administração pela interface e deixam evento de auditoria. Resend usa o transporte SMTP existente quando configurado. |
| Recebimento de documentos por canal seguro | Não implementada | O modelo WhatsApp informa que a equipe orientará a entrega por canal seguro. O cadastro e a coleta admissional pertencem a outro ciclo. |
| Lembretes automáticos adicionais | Não implementada | Reutilizados agenda, tarefas e automações existentes por configuração explícita. A fila de e-mail reserva cada envio para evitar repetição por concorrência. |
| Localização, acessibilidade e uso móvel | Validada localmente | Revisão concentrada nas telas da jornada. Formulário de vaga em uma coluna no celular, rótulos em português brasileiro, datas explícitas e informações de agenda no acompanhamento. |

## Falhas encontradas e corrigidas

- Links criados contavam como apresentações enviadas. A confirmação agora grava a data e o responsável em operações coordenadas. Repetir a confirmação mantém uma única data e um evento.
- O indicador da central retirava o DISC da fila ao receber as respostas, antes da revisão humana. A pendência considera a conclusão da revisão para avaliações nativas reais. O resumo da vaga reconhece o DISC nativo revisado e os registros fictícios ficam fora da contagem e do reaproveitamento.
- Abrir um segundo convite DISC na mesma aba podia manter o resultado anterior. O questionário passou a carregar o novo link individual e descartar respostas de carregamentos anteriores.
- A comparação não limitava a seleção. A interface permite escolher até três finalistas.
- Renomear **Finalistas** podia retirar a pessoa da apresentação e impedir o registro do retorno. Apresentação, feedback e vaga passaram a usar o papel operacional da etapa.
- O formulário de entrevista interpretava a data conforme o servidor e o autoagendamento sugeria Nova York. A entrada manual indica Brasília, o seletor oferece Brasília como padrão e a confirmação formata o horário em português brasileiro.
- O filtro por responsável existia apenas na central. A lista e o Kanban passaram a usar a mesma regra de responsabilidade da central, com prioridade para a participação e uso do responsável da vaga quando a participação estiver sem responsável. O filtro é preservado ao alternar entre as vistas.
- O lote não oferecia campo para justificativa. A observação do lote agora acompanha cada movimento efetivo e fica no histórico.
- A ficha dispersava formação, experiência, disponibilidade e pretensão entre cadastro e parecer. A seção de dados profissionais reaproveita o que foi registrado, inclusive a formação e a trajetória do currículo quando usadas na ficha.
- Os modelos de mensagem eram fixos e o DISC tinha uma prévia separada sem edição nem registro de WhatsApp. A configuração agora é por organização. A emissão do DISC preserva seu link individual e continua separada dos demais modelos.
- Telefones e endereços de e-mail poderiam entrar manualmente em campos profissionais da apresentação. Esses padrões são omitidos na projeção pública. A revisão humana do texto e dos arquivos selecionados continua necessária.
- A seção opcional de verificações complementares aceitava texto livre sem contexto. Registros novos ou alterados exigem finalidade, autorização e fundamento. Registros legados inalterados podem ser preservados.
- A vaga não mostrava a distribuição das fontes gravadas. Registros sem fonte permanecem em **Origem desconhecida**. A contagem é por participação, inclusive quando houver inclusão manual.

## Validação local

| Verificação | Evidência |
| --- | --- |
| Dependências | `npm ci` com cache gravável no workspace. |
| PostgreSQL 16 | Migrações aplicadas em bases descartáveis, uma para o navegador e outra para a suíte. |
| Prisma e TypeScript | `npx prisma validate` e `npm run typecheck` concluídos. |
| Suíte completa | Duas execuções completas com 1.097 testes aprovados em 103 suítes, antes do ajuste final do filtro por responsável. Em uma execução intermediária, 1.096 passaram e o caso de reconstrução de índice inválido em `tests/indexes.test.ts` falhou uma vez após reparar o índice. O caso passou na reexecução dirigida e na execução completa seguinte com outra base descartável. |
| Reexecuções dirigidas | 42 testes aprovados em oito suítes de operação e índices. Após o ajuste do filtro por responsável, 44 testes adicionais em três suítes de lista, paginação, contagem e navegação. |
| Build | `npm run build` concluído na revisão entregue. |
| Desktop | Chromium 156 em 1440 × 900. [Acompanhamento operacional](evidencias-fechamento-5b-5c/operacao-desktop.jpg), [versões do parecer](evidencias-fechamento-5b-5c/parecer-versoes-desktop.jpg) e [comparação das três finalistas](evidencias-fechamento-5b-5c/finalistas-comparacao-desktop.jpg). |
| Celular | Chromium 156 em 390 × 844. [Acompanhamento operacional](evidencias-fechamento-5b-5c/operacao-mobile.jpg), [Kanban](evidencias-fechamento-5b-5c/kanban-mobile.jpg), [DISC fictício](evidencias-fechamento-5b-5c/disc-candidato-mobile.jpg), [referências](evidencias-fechamento-5b-5c/referencias-mobile.jpg) e [apresentação ao cliente](evidencias-fechamento-5b-5c/apresentacao-cliente-mobile.jpg). |
| Encerramento da jornada | Três finalistas com parecer em PDF. O acesso ao PDF do cliente foi bloqueado sem link e após revogação. O histórico confirmou aprovação, correção administrativa da contratação e reabertura com avaliações preservadas. |
| Anúncio longo | Prévia editada com 2.639 caracteres. Download de PNG, geração em PDF pelo navegador e conferência da última linha no documento de impressão. |
| Permissões | Cenários de administração, recrutamento, entrevistador atribuído, candidatura pública, cliente com link e segunda organização. Testes de isolamento e acesso às mutações no PostgreSQL. |

## Dependências da administração

### DISC

Fornecer o nome e a edição do instrumento, a documentação de titularidade ou licença para aplicar, digitalizar, armazenar, reaproveitar e emitir o resultado, e a autorização formal de uso. Confirmar os itens e a ordem, a regra de preenchimento, as dez linhas da chave oficial, o mapeamento de cada opção para D, I, S e C, os pesos e a direção de cada posição. Informar a regra de soma e de normalização quando aplicável, a escala de saída, o tratamento de empates e exemplos oficiais de respostas com os quatro resultados esperados.

Identificar o material aprovado de interpretação, os limites de finalidade, os papéis responsáveis pela revisão, as condições de reaproveitamento e o prazo aplicável. A publicação usa uma referência documental e uma versão inédita da chave aprovada. O código atual calcula os pesos posicionais conforme a chave compatível. Caso a metodologia oficial use outro cálculo, validar a implementação contra os exemplos oficiais antes de liberar convites reais.

### Ficha, parecer e comunicações

- Enviar a ficha em branco ou anonimizada com versão e data. Confirmar formação, trajetória, experiência, disponibilidade, pretensão, triagem, roteiro por tipo de vaga, escala, campos obrigatórios, assinatura e papéis de revisão.
- Confirmar quais trechos de entrevista, DISC e referências pertencem ao documento interno e quais seções do parecer o cliente pode receber. Conferir o modelo institucional, a nomenclatura e o tratamento de documentos profissionais selecionados.
- Confirmar quando verificações complementares têm justificativa profissional, quem pode registrá-las e como referenciar autorização e fundamento.
- Validar o texto dos modelos e o canal seguro que a equipe poderá indicar para documentos. Homologar o transporte Resend com um destinatário previamente autorizado, se necessário.

## Roteiro de homologação da Rayane

1. Entre com o perfil de recrutadora. Cadastre empresa e vaga, informe atividades, requisitos, salário, benefícios, escala, modalidade, contratações e data. Confirme a empresa oculta na divulgação até a autorização explícita. Valide o anúncio antes de copiá-lo, baixar PNG ou salvar o PDF.
2. Faça três candidaturas fictícias no portal. Use um link com fonte registrada e outro sem campanha. Confirme a etapa inicial, a distribuição de origem, a triagem e os filtros por empresa, vaga e responsável na central.
3. Mova as três participações de uma vez, registre a observação e confira o histórico. Agende entrevistas para hoje e para outra data. Confira o horário nas fichas, na agenda e na central. Teste o acesso de uma pessoa entrevistadora atribuída e de outra organização.
4. Escolha um roteiro por competências na vaga. Registre notas, evidências e recomendação na participação. Aplique o DISC fictício na organização autorizada e confira rascunho, revisão e síntese no parecer interno. Cadastre uma referência autorizada e registre tentativa, origem da resposta e verificação.
5. Emita um parecer por finalista. Revise no PDF do rascunho, altere um e emita a segunda versão. Compare os três, confira a prévia compartilhada e abra o link em uma janela privada. Registre o envio à parte e confirme o efeito na central. Simule revogação e teste o acesso novamente.
6. Registre a aprovação de uma pessoa e confirme que a contratação continua separada. Quando necessário, registre e corrija uma contratação com a administração. Encerre e reabra outra participação. Confira a preservação das avaliações, das versões de parecer e da trilha.

## Integração e riscos residuais

- `prisma/schema.prisma` recebeu somente `Organization.whatsappTemplates` e `ShareLink.sentAt`, ambos opcionais. A migração `20261126180000_rga_operational_close` é incremental. Integrar estes dois campos com as migrações do trabalho paralelo, preservando os demais trechos.
- `src/app/(app)/actions.ts` altera agendamento manual, mudança em lote e invalidação do funil ao atribuir uma vaga. O carregador de páginas, a API e o cache do funil passam a considerar o responsável. `src/app/(app)/settings/page.tsx` acrescenta a edição na seção de e-mail. A ficha compartilhada da participação recebe a projeção dos dados profissionais e os modelos. O acesso global e `src/server/applications.ts` mantêm a implementação da base.
- Links antigos sem confirmação permanecem com o histórico de emissão. A data de envio exige confirmação e não foi retropreenchida. O retorno pendente na central continua condicionado a uma apresentação vigente. A nova versão do parecer precisa de nova revisão de compartilhamento. O retorno do cliente é informado pela recrutadora na vaga.
- O painel reconhece datas de candidatura completas no formato brasileiro ou ISO. Prazos internos sem data registrada, rotinas que exigem retorno direto ao candidato e outras pendências manuais podem ser registradas nas tarefas existentes.
- O recorte do navegador cobre a jornada de seleção com dados fictícios. Homologação na revisão publicada, entrega real por WhatsApp/Resend, validação institucional do formulário e permissão para aplicar o DISC em processos reais permanecem pendentes.

A trilha de decisão da vaga e a data de contratação por participação ficam disponíveis para o planejamento do ciclo 5D. A situação comercial e financeira deve ser definida no escopo desse ciclo.
