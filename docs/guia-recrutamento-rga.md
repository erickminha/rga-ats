# Guia de homologação para a recrutadora

Use o endereço de homologação informado pela administração. Entre com a conta que o administrador cadastrou com o perfil **Recrutadora**. Use somente dados fictícios durante a homologação.

1. Em **Empresas clientes**, cadastre a empresa e confira o nome antes de salvar. Em **Vagas**, crie a vaga e vincule a empresa. Quando a organização exigir aprovação, solicite a publicação e aguarde o administrador.
2. Abra a vaga e use **Abrir funil desta vaga**. Candidaturas do portal chegam em **Candidatura**. Para inclusão manual, use **Adicionar candidato** e escolha a vaga. Confira o currículo da participação antes de avaliar ou apresentar a pessoa.
3. Mova candidatos pelo Kanban ou pelo seletor de etapas da ficha. Use a observação quando avançar várias etapas ou voltar. A ficha registra as movimentações em **Histórico**.
4. Abra a ficha para registrar a **Triagem**, organizar a **Entrevista** e preencher sua avaliação. O kit usa o currículo da candidatura quando disponível. As avaliações e o parecer pertencem à participação naquela vaga.
5. Mova os candidatos selecionados para **Finalistas**. Registre o resultado recebido em **Avaliação DISC**, com os valores D, I, S e C se estiverem disponíveis, e anexe o relatório em PDF. Em **Parecer**, salve como rascunho e finalize após revisar a recomendação.
6. Na vaga, abra **Finalistas e apresentação ao cliente**. Selecione as pessoas e, se autorizado, marque os resumos de parecer que deseja incluir. Confira a apresentação antes de enviar o link. Você pode revogar os links da vaga a qualquer momento.
7. Use **Contratação** e confirme a data efetiva. Para reprovação, desistência ou outro encerramento, abra **Encerrar participação**, selecione a categoria e o motivo e inclua uma observação interna se necessário. O motivo aparece no histórico. Para corrigir um encerramento, use **Reabrir participação** e mantenha a etapa anterior ou escolha outra.
8. Para relatar um erro, informe à administração a tela, os passos, o resultado esperado e o horário. Use uma captura com dados fictícios ou ocultados. Evite anexar currículos, endereços pessoais ou links de acesso.

## Preparação administrativa

Em **Configurações → Dados**, use **Aplicar motivos iniciais da RGA**. O comando adapta motivos herdados com nome exato e sem categoria, preserva os IDs e adiciona sugestões ausentes. Revise a categoria dos motivos antigos, pois os registros sem categoria explícita continuam seguindo o indicador anterior de reprovação. Em **Configurações → E-mail**, **Traduzir modelos padrão de e-mail** altera somente modelos que ainda correspondem exatamente ao original.

As migrações `20261124160000_recruiting_outcomes` e `20261124170000_recruiting_assessments` são aditivas. O scanner e o armazenamento privado precisam estar operacionais antes de anexar currículos ou relatórios no ambiente hospedado. O guia anterior lista as dependências de privacidade e infraestrutura. [Consolidação de segurança](rga-consolidacao-seguranca.md)

## Cadastro no banco de talentos e currículos

Use **Banco de talentos → Adicionar candidato** para guardar o cadastro sem iniciar uma seleção. Você pode voltar à ficha, corrigir os dados e anexar currículos. Em **Currículos e documentos**, abra os arquivos da pessoa e indique o principal ou vincule uma versão a uma participação ativa. Trocar o principal preserva a versão usada nos processos anteriores. O histórico da ficha abre a participação específica para consultar entrevistas, DISC e parecer.

Confirme a intenção com a pessoa antes de registrar sua preferência em **Preferências de armazenamento e contato**. Para avaliar duplicatas, abra os dois cadastros e confira os dados de contato e as participações antes de unificar. Uma semelhança de nome é apenas uma sugestão. Continue usando **Configurações → Importações → Planilhas da RGA** para importações com prévia e relatório.

O OCR aceita o modelo português local. Em uma implantação autorizada, use `OCR_LANGS=por+eng` no build e no processo do ATS para currículos mistos. Os dois modelos são distribuídos com o aplicativo. O OCR precisa da rotina de processamento e de acesso ao armazenamento privado. Revise o documento e corrija o perfil manualmente quando o resultado estiver incompleto.

## Busca, grupos e reaproveitamento

No **Banco de talentos**, abra **Busca avançada, grupos e indicadores** para localizar perfis e texto dos currículos. Combine filtros profissionais e escolha **Não informado** quando quiser separar campos vazios de uma resposta negativa. Os indicadores contam pessoas. As distribuições destacam as áreas e localidades mais frequentes.

Crie um grupo manual e insira pessoas pela ficha ou pela seleção em lote no banco. Para um segmento dinâmico, informe os filtros, busque e selecione **Novo grupo ou segmento** para gravar a busca. O segmento acompanha os dados cadastrados. Use etiquetas relacionadas ao trabalho e confirme as informações antes de aplicá-las.

Na vaga, use **Buscar candidatos no banco de talentos**. Edite a sugestão do cargo e, quando houver requisitos registrados, use-os como palavras-chave. Abra a ficha para conferir o profissional, selecione a versão de currículo e marque as pessoas que deseja incluir. Escolha a etapa inicial e confirme. O sistema cria novas participações, preserva as anteriores e avisa sobre vínculos já existentes. A inclusão não envia e-mails.

O reaproveitamento exige autorização vigente para armazenamento para futuras oportunidades. Registre essa preferência somente depois de confirmá-la com o titular. O descadastro de comunicados continua valendo e não é alterado pelo registro da preferência de armazenamento.

## Avaliação por competências e DISC

Em **Configurações → Contratação → Modelos de avaliação**, a administração pode ajustar, duplicar ou desativar os seis modelos iniciais. Na vaga, abra **Roteiro de avaliação da vaga** e copie um modelo ou as perguntas do scorecard da organização. Adapte o roteiro e a escala da vaga antes das entrevistas.

Na participação, use **Entrevista por competências** para salvar respostas, evidências, notas e aderência aos requisitos da vaga. Use **Não avaliado** quando faltar evidência. A recomendação exige justificativa e pode ser salva em rascunho. Edite as etapas separadamente conforme a decisão da equipe. Use **Comparar finalistas**, na vaga, para comparar somente as pessoas selecionadas.

Ao registrar DISC, informe a escala indicada no relatório e anexe o PDF original. Para usar uma avaliação anterior da mesma pessoa, confira validade, autorização e finalidade. Registre essa confirmação na participação atual. O sistema identifica a origem e mantém o documento na participação original.
