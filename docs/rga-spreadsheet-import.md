# Importação de planilhas da RGA

## Planilhas e mapeamentos verificados

A conferência consultou metadados e intervalos de cabeçalho. A carga deve usar arquivos exportados e revisados pelo operador. Os mapeamentos desta nota são preliminares até validar os valores em uma simulação autorizada.

| Origem | Cabeçalhos confirmados e tratamento |
| --- | --- |
| Gestão de Trabalho, `Empresas`, linha 1 | Contém `Nome`, `Nome Fantasia`, `CNPJ`, `IE`, `Segmento`, `Porte`, `Contato`, `Cargo`, `Telefone`, `Telefone 2`, `E-mail`, `Website`, `Canais`, `CEP`, `Endereço`, `Cidade`, `Estado`, `Observações`, `Origem`, `Status` e `Data Cadastro`. Destino `ClientCompany`, mantendo `Telefone 2` em `secondaryPhone` e `Canais` em `channels`. Conferir o significado de `Nome` antes de tratá-lo como razão social. O cabeçalho não tem um ID explícito, então a conciliação deve tratar CNPJ válido e conflitos antes de usar outros campos. |
| Gestão de Trabalho, `Candidatos`, linha 5 | Contém `Data Seleção`, `Empresa`, `Cargo`, `Nome`, `Telefone`, `Bairro`, `Entrevista marcada`, `Data Entrevista`, `Candidato Admitido`, `ENVIO DE PARECER` e `Observação`. Há também rótulos genéricos de coluna. `Empresa` e `Cargo` são referências textuais. Vincular à vaga somente quando a referência for inequívoca. |
| Gestão de Trabalho, `Controle de Vagas` e `Acompanhamento de Vagas Clientes` | Ambas as abas existem. A linha 1 tem o título da aba. Cabeçalhos operacionais e chave autoritativa de vaga ainda precisam ser confirmados no arquivo de importação. |
| Banco de Talentos (respostas), `Respostas ao formulário 1`, linha 1 | Confirmados `Carimbo de data/hora`, `Nome Completo`, `Telefone (com DDD)`, `Cargo de Interesse`, `Outro cargo não especificado anteriormente`, `Estado`, `Cidade`, `Bairro`, `Pretensão Salarial`, `Upload de Currículo`, termo de autorização, `Possui CNH?`, `Status`, `Obs:`, `Traços percebidos - Perfil`, `E-mail`, `Origem` e `ID Origem`. A prévia deve separar correspondência de identidade de referência a vaga. Cargo de interesse sozinho não identifica uma vaga. A coluna de currículo não representa um arquivo disponível no ATS. A importação não concede permissões de marketing nem de divulgação. |

## Operação no ATS

1. Em **Configurações → Dados → Importações**, abra **Importar planilha**. A área é reservada a administradores. A carga de empresas requer uma organização do tipo agência.
2. Exporte um CSV por aba no Google Sheets. Para XLSX, coloque a aba desejada em primeiro lugar. Use até 4 MB, 5.000 linhas lidas e 50 colunas por arquivo. Formate CNPJ, telefone, CEP e identificadores como texto antes de exportar para preservar zeros iniciais.
3. Importe na ordem **Empresas → Vagas → Candidatos da Gestão de Trabalho / Banco de Talentos**. Selecione o tipo e a linha do cabeçalho. Revise as sugestões e ajuste o mapeamento nas colunas ambíguas. Para vagas, mapeie um identificador estável e único na origem. Confira manualmente os cabeçalhos das abas de vagas e sua chave antes da carga.
4. Gere a prévia e confira novos registros, atualizações, duplicidades e erros. A prévia dura 30 minutos. Se o arquivo, o mapeamento ou o resultado planejado mudar, gere outra.
5. Confirme após revisão. A operação grava somente as linhas válidas. Corrija as linhas com erro e rode uma nova prévia. O histórico registra totais e até os primeiros cem erros com o número da linha lida. O arquivo original fica com o operador.

## Conciliação e efeitos

- **Empresas.** O importador consulta o ID de origem, CNPJ válido e nome na organização. Identificadores divergentes ou nomes ambíguos ficam para revisão. A atualização preenche campos vazios, incluindo `secondaryPhone` e `channels`, e preserva valores preenchidos no ATS.
- **Vagas.** Cada vaga nova fica como rascunho e usa o ID de origem para reimportações. O vínculo com a empresa usa uma referência já importada, CNPJ ou nome único. Vagas existentes preservam o estado de publicação e o vínculo de cliente. Quando um salário tem centavos, o valor de origem permanece no conteúdo interno da vaga. Os campos de salário inteiro recebem somente valores inteiros.
- **Candidatos.** O importador cruza o ID de origem, e-mail e telefone dentro da organização. Conflitos de identidade ficam para revisão. Só vincula um processo seletivo ao encontrar um ID de vaga conciliado pela importação. Empresa, cargo, entrevista, admissão e situação da planilha, quando mapeados, permanecem como histórico de origem. Para seleções sem vaga conciliada da Gestão de Trabalho, mapeie um ID único da seleção ou o conjunto de empresa, cargo e data da seleção. Participações distintas ficam associadas ao mesmo contato, com histórico próprio. Linhas sem referência suficiente ou com dados divergentes para a mesma seleção ficam para revisão. A admissão histórica não movimenta o candidato no funil. Contatos novos e endereços adicionados pela carga ficam fora de comunicados. Autorizações e arquivos de currículo exigem tratamento separado. A importação não dispara e-mails.
- **Reimportação.** O histórico usa `ImportJob` e a conciliação usa `ImportRef`. Alterações em campos preenchidos, exclusões e fusões ambíguas exigem revisão manual. Preserve os IDs de origem ao corrigir ou renomear registros. Concilie primeiro as referências das vagas e dos clientes. Se uma seleção sem vaga já foi importada com o mesmo ID ou conjunto de empresa, cargo e data, revise o vínculo no ATS antes de reapresentar a seleção com ID de vaga.

A carga real depende de revisar os cabeçalhos e as chaves das abas de vagas e conferir uma prévia com o arquivo liberado pela RGA. As simulações desta entrega usam dados fictícios e PostgreSQL local. A Parte 6 reaproveita os modelos e as migrações existentes.

## Conciliação de autorizações já importadas

Em **Configurações → Dados → Importações → Importar planilha**, selecione **Conciliar aceites do Banco de Talentos**. Mapeie o ID de origem e o termo completo da versão aprovada do formulário. Confira na prévia quantos aceites constam expressamente na fonte e quantos dependem de uma atestação administrativa. Para esta última, use o código do documento aprovado pela RGA, arquivado com a identificação do lote ao qual se aplica. Confira o lote antes de confirmar.

A conciliação exige referência de importação na mesma organização. IDs ausentes, duplicados ou respostas divergentes exigem revisão. Cadastros anonimizados, com bloqueio de retenção ou com consentimento anterior, inclusive revogado, ficam preservados. O histórico associa o responsável, o lote, a linha, o tipo de evidência e a impressão SHA-256 do arquivo. A data gravada em ConsentRecord corresponde ao registro no ATS. O procedimento concede exclusivamente armazenamento do perfil. Para novas cargas, importe primeiro os talentos e depois confira a prévia de conciliação do mesmo arquivo.
