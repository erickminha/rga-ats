# Evidências da importação de planilhas RGA

As simulações usaram PostgreSQL local e dados fictícios. O fluxo de importação foi conferido no Chromium em 1440 × 900, 390 × 844 e 320 × 700.

- [Mapeamento em desktop](desktop-mapeamento.jpg)
- [Prévia em desktop](desktop-previa.jpg)
- [Relatório no histórico](desktop-relatorio.jpg)
- [Prévia da reimportação no celular](mobile-reimportacao.jpg)

Na primeira execução, a prévia identificou três linhas, com uma empresa nova, uma duplicidade e um CNPJ inválido. A prévia deixou o banco intacto. A confirmação gravou somente a linha válida. O relatório permaneceu disponível no histórico. Ao reimportar, o sistema encontrou zero novos, duas linhas duplicadas ou sem alteração e o mesmo erro. Um membro sem permissão administrativa foi redirecionado às configurações. Um administrador de outra organização recebeu uma página 404 ao abrir a URL do relatório.

Os testes de integração verificam conciliação de empresas, telefone secundário e canais, criação de vaga como rascunho, vínculo por ID de vaga, isolamento entre organizações, conflitos de identidade, concorrência e preservação de campos preenchidos. Não houve disparo de e-mails, consentimento automático nem criação de arquivo fictício de currículo.

A verificação integrada no Chromium também percorreu o login em português, a recuperação de senha com SMTP local, o portal de vagas, a candidatura com currículo fictício e o acompanhamento por link individual. Os testes automatizados verificam a seleção do transporte Resend quando configurado e a precedência de SMTP_URL.

## Revisão do histórico de seleções

No Chromium em 390 × 844, a importação de um CSV fictício com cabeçalho na linha 5 registrou duas seleções sem vaga para o mesmo contato. A reimportação em ordem inversa identificou duas duplicidades e zero novos registros. Os testes em PostgreSQL local também verificaram a preservação das informações de cada seleção, o uso de ID de origem, a divergência de dados e as linhas com referência insuficiente.

TypeScript, build e `git diff --check` passaram. A asserção de data já conhecida no importador Pinpoint permanece. As simulações usaram SMTP local e PostgreSQL descartável.
