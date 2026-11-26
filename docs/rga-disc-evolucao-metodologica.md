# ADR — Evolução do DISC RGA: motor experimental e ativação do instrumento atual

Status: decisão de arquitetura e backlog de investigação (2026-11-26). Não é autorização de uso real nem entrega de novo instrumento.

## Preservar o que existe
Central DISC por profissional e fluxo nativo por participação, permissões, tokens de convite com expiração, respostas e revisão, histórico, resultados externos, PDF privado, reaproveitamento autorizado e integração ao parecer. Não introduzir segundo servidor, Python, PHP, Django, Svelte ou banco adicional.

## Referências técnicas (código MIT, sujeito aos direitos de terceiros sobre conteúdo)
- https://github.com/dzyla/disc-personality-assessment — estudar separação do motor, itens reversos, controle de respostas repetitivas e inconsistências, resultados próximos e evidências por item. Ler docs/PROVENANCE.md: itens majoritariamente escritos por IA, sem validação em pessoas, explicitamente não destinado à contratação. Não adotar os itens, pesos, limiares ou intervalos como validados. Indicadores individuais não equivalem à confiabilidade psicométrica populacional.
- https://github.com/dyaskur/disc-assessment-test — estudar experiência de aplicação, progressão por grupos, revisão, responsividade, internacionalização e visualização. O cálculo soma por posição, não constitui chave validada. Não importar armazenamento de dados pessoais no navegador ou dependências de UI Svelte. Não copiar conteúdo sem verificar sua procedência.
- Preservar atribuições/licenças se houver reutilização de código.

## Arquitetura proposta
1. Motor TypeScript puro, desacoplado da interface e sem IA para pontuação. Definições de instrumentos e versões imutáveis, IDs estáveis, chave explícita por item, escala declarada e referências de origem.
2. Metodologia experimental de autoconhecimento em escopo de pesquisa voluntária separado do recrutamento. Eventual formato Likert, com itens reversos apenas se metodologicamente justificados, pontuação e indicadores descritivos, tratamento de empates e ausência de respostas. Não apresentar percentis, margens de erro ou graus de confiabilidade sem evidência apropriada. Itens, tradução e regras dependem de revisão especializada.
3. Interface React/Next.js mobile-first, navegação acessível, progresso, rascunho protegido no servidor e envio único. Persistência Neon/Prisma e PDF-lib existente. Definições e resultados experimentais isolados do recrutamento, sem uso em filtros, ranking, parecer de seleção, decisão ou compartilhamento com clientes. Não usar resultados de candidatos reais para validar sem protocolo e autorização específicos.
4. Testar vetores de cálculo, itens ausentes, reversão, empate, invariância à ordem de exibição, integridade de versão, segurança e fluxo completo em PostgreSQL descartável. Nenhuma pontuação experimental deve ser promovida retroativamente a resultado validado. Estudos de validade/confiabilidade, equidade, finalidade e autorização/licença são necessários antes de considerar uso em seleção.
5. Não adicionar chamadas externas para pontuar. Se houver interpretação assistida futura, manter opt-in, cotas, dados mínimos e revisão humana. Nenhuma decisão automática de contratação.

## Instrumento atual — bloqueio exato
O fluxo nativo usa src/lib/native-disc.ts e src/server/native-disc.ts. São dez grupos de quatro adjetivos ordenados de 4 a 1 sem repetição. A chave provisória associa todas as linhas a D/I/S/C pela posição; a soma por dimensão vai de 10 a 40, com total 100. Não há evidência registrada de que esse mapeamento seja a correção oficial. RGA_DISC_APPROVED_KEY requer JSON com version inédita, reference documental e mapping com dez linhas, cada uma contendo D/I/S/C exatamente uma vez. O código verifica estrutura, não validade científica nem titularidade. Não configurar uma versão fictícia para contornar o bloqueio.

Para homologar o instrumento vigente: obter formulário/origem e versão, direito de utilização/digitalização, chave verdadeira (cada adjetivo por linha), regras de pesos/normalização/empates e exemplos anonimizados de entrada e resultado esperado; reproduzir o cálculo antigo e comparar. Se o método não corresponder à soma posicional, adaptar o motor e validar os exemplos antes de configurar a chave. Evidência adequada de uso profissional e revisão humana permanecem requisitos para aplicação em recrutamento. Configuração em homologação, teste de convites/respostas/relatório com dados fictícios e aceite explícito antes de uso real. Não modificar RGA_DISC_TEST_ORG_ID, RGA_DISC_APPROVED_KEY ou permissões apenas para permitir convites.

O questionário independente de vaga permanece uma pendência técnica separada: o fluxo NativeDisc exige Opportunity ativa com Posting; o novo TalentDisc permite registros externos independentes, não convites nativos. Esta ADR não implementa a pendência nem altera dados ou variáveis de ambiente.
