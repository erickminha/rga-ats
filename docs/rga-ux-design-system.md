# RGA UX — identidade e operação

Base: PR #15. Paleta do Brand Book: #1581C9, #6C336E, #F9C82B, #F5F5F5, #161D27; tom #116DA9 reservado às ações para contraste. Poppins e Lato via next/font/local, com licenças OFL versionadas. Sem download de fontes durante build. O logo cadastrado na organização é reutilizado; sem logo, usa-se a identificação textual RGA, sem desenhar um símbolo alternativo.

- Menu com três grupos, atalhos operacionais no mobile e Empresas somente conforme permissão existente. Busca global permanece acessível.
- Dashboard com dados reais: publicadas/internas, total de vagas, contatos não anonimizados, participações visíveis no funil e entrevistas futuras. Não confundir contagens de participações com pessoas únicas.
- Funil com nome, interesse, contato e localização; colunas com contagem carregada e indicador de mais resultados. A ação incluir candidato do PR #15 é preservada.
- Login responsivo, campos e botões com foco visível, componentes de tabela e superfícies mais contrastados. Preservados notices AGPL e regras de autorização.
- Nenhuma migração ou mutação de dados. Consentimento e currículo dos importados permanecem pendências funcionais, não contornadas.

## Aceite em homologação
- Rodar npm run typecheck, npm test, npm run build; validar em 1440x900, 1024x768, 390x844 e teclado.
- Conferir menu com perfis autorizados/restritos e navegação mobile; conferir dashboard com números reais e ausência de dados; confirmar Lista/Kanban, filtros, inclusão de talentos autorizados, links tel/mailto e retorno ao funil; verificar login e recuperação de senha; conferir portal público e branding específico.
- Sem teste visual autenticado nesta entrega: não afirmar aprovação de UX antes da revisão.

## Auditoria pré-deploy
Corrigidos navegação otimista, filtros no Kanban, lista vazia sem controles, status encerrados, pré-seleção de vaga e etapa no cadastro novo, barra de inclusão no topo, contagem do painel alinhada ao funil e escopo de estilos nos portais. Fontes locais OFL. Testes de URLs incluídos; build, suíte e validação visual pendentes. Consentimentos e currículos importados permanecem pendências funcionais.
