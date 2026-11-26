# Ciclo 5C.3 · Funil e referências profissionais

Base inicial de trabalho `homolog` em `6f31c0a`. A branch foi atualizada para `b26f5f6`, que recebeu a PR #33 do Ciclo 5C.2 durante o desenvolvimento. Migração incremental `20261126163000_rga_operational_references`. Ela acrescenta disponibilidade de etapas com padrão ativo, exclusões por vaga, questionário por organização e tabelas de verificação, referências e contatos. Nenhuma etapa, participação ou versão de parecer existente é reescrita.

## Auditoria da ficha provisória

| Item do planejamento | Onde está hoje | Validação pendente |
| --- | --- | --- |
| Trajetória, experiência e formação | Cadastro e currículo, com campos profissionais disponíveis no parecer | Confirmar o que precisa aparecer na ficha impressa |
| Disponibilidade e pretensão | Cadastro estruturado do talento e campos profissionais da ficha | Confirmar se os valores precisam ser registrados também por vaga e em quais unidades |
| Triagem | Resultado e observações por participação | Confirmar roteiro obrigatório e alternativas de resultado |
| Roteiro, competências e evidências | Plano configurável da vaga, entrevista por competências, notas, evidências e recomendação | Confirmar perguntas, escala, obrigatoriedade e papéis de revisão |
| DISC | Central DISC e registro vinculado à participação | Confirmar apenas os campos que constam na ficha oficial |
| Referências e parecer | Nova verificação por participação, fontes identificadas nos trechos selecionados e parecer emitido em versões | Confirmar quais campos aparecem na ficha interna e quais a administração autoriza compartilhar |

O roteiro de homologação e o planejamento revisado descrevem a operação, mas a revisão dos arquivos rastreados não encontrou um modelo oficial da ficha provisória. A administração precisa enviar um formulário em branco ou exemplar anonimizado, a versão/data vigente, os campos obrigatórios por tipo de vaga, as escalas e opções do roteiro, a regra de assinatura/revisão e as seções destinadas ao cliente. Comparar esses itens antes de acrescentar campos ou alterar a impressão.

## Homologação para a Rayane

1. Uma administradora abre **Configurações → Contratação**, reordena duas etapas do mesmo grupo e desativa uma etapa opcional. Confirme que a participação já nessa etapa permanece na lista. Reative a etapa e repita em **Etapas desta vaga** para somente uma vaga.
2. Mova participações fictícias pelo Kanban e pelo seletor da lista. Volte uma etapa, registre uma observação e confirme data, pessoa responsável e justificativa no histórico. Teste **Corrigir contratação registrada** com uma administradora e confira o contador de contratados e da requisição.
3. Abra **Acompanhamento operacional** no funil ou nos indicadores da vaga. Confira filtros por vaga, empresa, responsável, etapa, criação da participação e pendência. O tempo usa a data da última troca de etapa. O indicador de inatividade usa sete dias em etapa ativa. O retorno pendente considera apresentações com link vigente e o cliente atual. O indicador de apresentações também considera links que já venceram.
4. Na participação, abra **Referências profissionais**. Registre a solicitação, cadastre um contato fictício com finalidade e autorização, registre uma tentativa e preencha o questionário. Selecione a origem das respostas e conclua a verificação. Uma administradora pode editar o roteiro em **Configurações → Contratação → Modelos de avaliação**.
5. Na central de WhatsApp da pessoa, confira o modelo de solicitação. No cadastro da referência, confira primeiro contato, lembrete e agradecimento. Exercite prévia, edição e cópia usando apenas números fictícios. Registre a tentativa no histórico da referência depois do contato real. As automações de e-mail preexistentes continuam sujeitas às configurações explícitas da organização.
6. No parecer, selecione somente informações profissionais pertinentes, revise a origem e finalize uma versão. Abra o PDF interno e a apresentação do cliente. A seção estruturada de referências fica fora da apresentação. Revogue a referência e confira a retirada dos dados operacionais e a preservação da versão emitida.
7. Repita com um perfil de entrevistador e com uma conta de outra organização. Verifique a ausência do cadastro de referências fora do acesso de recrutamento. Em tela estreita, repita usando o seletor de etapas do cartão.

## Integração com o Ciclo 5C.2

A PR #33 também alterou `prisma/schema.prisma`, `src/server/applications.ts`, `src/server/retention.ts`, `src/lib/list-types.ts` e `src/app/(app)/settings/page.tsx`. Foram mantidas as duas alterações em cada arquivo e as migrações têm nomes distintos. Preservar as migrações independentes e aplicar as duas no PostgreSQL local em ordem antes de autorizar o Cloud Build. Fluxos de importação histórica preservam o mapeamento original das etapas. O reaproveitamento do banco de talentos merece um teste cruzado com etapas desativadas antes da integração.

Submeter as duas entregas à auditoria antes de integrar em `homolog` e aprovar o Cloud Build coordenado.

## Validação local

- `prisma validate`, `npm run typecheck` e `npm run build` concluídos com sucesso após a atualização para a base integrada.
- Cinco suítes focadas passaram com 18 testes em PostgreSQL 17 local. O recorte inclui disponibilidade e reordenação de etapas, histórico, preservação de avaliações, correção de contratação, indicadores, referências, questionário, pareceres, acesso e regressão dos fluxos do 5C.2.
- Chromium em desktop e mobile com dados fictícios. Validados o arraste no Kanban, a mudança pela lista, o filtro de referências, a edição de status no celular e a ausência de rolagem horizontal na tela operacional e na ficha.

| Tela | Desktop | Mobile |
| --- | --- | --- |
| Acompanhamento operacional | [Captura desktop](evidencias-ciclo-5c3/operacao-desktop.jpg) | [Captura mobile](evidencias-ciclo-5c3/operacao-mobile.jpg) |
| Referências profissionais | [Captura desktop](evidencias-ciclo-5c3/referencias-desktop.jpg) | [Captura mobile](evidencias-ciclo-5c3/referencias-mobile.jpg) |
