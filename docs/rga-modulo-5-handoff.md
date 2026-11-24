# Módulo 5/5 — Banco de talentos, LGPD, R2 e sincronização

## Ponto de partida e ordem obrigatória
PR #16 consolidado, direcionado a homolog, incorpora PR #15 (encerrado como substituído) e auditoria UX. Antes de mesclar: npm ci, npm run typecheck, npm test e npm run build. Corrigir falhas; validar Lista/Kanban, filtros, inclusão de talentos existentes, painel, login, mobile, papéis e portal público. Não implantar produção. Cloud Build homolog requer aprovação do usuário.

Neon homolog, 24/11/2026: 2.103 contatos não anonimizados, 38 vagas, 21 empresas, 1 participação, 0 consentimentos PROFILE_STORAGE vigentes e 0 currículos principais. Não recriar contatos. Fontes oficiais: Google Sheets Gestão de Trabalho e Banco de Talentos (respostas), e pasta original de currículos no Google Drive. Recuperar IDs das fontes em configuração privada, não publicar dados pessoais, URLs privadas ou credenciais.

## 5.1 — Consentimento e reconciliação
- Usar ImportRef e IDs estáveis para reconciliar os 2.102 importados. Mapear aceite no importador/preview e disponibilizar correção retroativa idempotente, auditada e autorizada.
- Responsável confirmou aceite de todos na origem e erro de registro da coluna histórica. Verificar evidência e escopo, distinguir aceite explícito de atestação administrativa documentada; registrar fonte, evidência e data real de registro. Não inventar data de consentimento nem finalidade de marketing. Pendências sem evidência suficiente exigem revisão formal antes da reutilização.
- Usar ConsentRecord / PROFILE_STORAGE e serviços existentes; preservar revogação, retenção, anonimização e isolamento. Nunca contornar reuseTalents.

## 5.2 — Currículos privados no R2
- Reconciliar links/IDs originais do Drive com ImportRef/ID de origem. Incluir mapeamento de currículo no preview e importador, vincular aos contatos existentes. Sem duplicar cadastros.
- Usar R2 privado para arquivos novos e históricos migrados, StoredFile, versões, resumeFileId e applicationResumeId; preservar origem Drive. Validar tipo/assinatura, tamanho, hash, deduplicação, acesso e fila com retries/checkpoint. Não excluir originais. Permitir somente IDs/URLs Drive validados e API autenticada de menor privilégio; bloquear URLs arbitrárias/SSRF.
- Verificar configuração Cloudflare/R2 e Secret Manager antes de usar; nenhum segredo no código/cliente/log. Acesso autenticado ou URL assinada curta, retenção e revogação efetivas. Sem bucket público.
- Exibir currículo no perfil, busca e funil, com visualização sem sair do fluxo e indicação de falha ou falta de permissão. Relatório agregado, sem PII.

## 5.3 — Sincronização incremental
Google Sheets/Drive continuam fontes históricas; Neon é operacional. Sincronização manual e diária configurável, unidirecional, com dry-run, lock, cursor, idempotência, retry/backoff, auditoria, limites de lote. Não excluir por ausência de linha ou sobrescrever alterações locais sem regra explícita. Detectar versões de currículo e alterações de consentimento sem reativar revogações. Não disparar mensagens. Usar Secret Manager e escopos mínimos.

## 5.4 — Fechamento histórico
Conferir 467 linhas de Candidatos (cabeçalho 5) e acompanhamento de vagas na Gestão de Trabalho. Importar com ID de seleção estável e identidade forte (ID/e-mail/telefone), não fundir por nome, não inventar vagas, contratações ou datas. Manter casos não resolvidos para revisão, preservar evidências históricas e usar o importador auditado. Não alterar estágios ou contratação automaticamente sem regra validada.

## Aceite e deploy
- Testes com dados fictícios em banco isolado; não executar testes destrutivos no Neon homolog. Backup antes de carga/migração; preview, relatório de diferenças e confirmação explícita para mutações reais.
- Testar duplicidade, idempotência, revogação, retenção, isolamento de org, permissões, currículo, falhas de rede e retomada. Contagens conciliadas antes/depois.
- PRs pequenos, testes e build comprovados, validação autenticada desktop/mobile. Homologação somente, sem produção. Não iniciar outros módulos sem fechar estes pontos. Documentar pendências e evidências, sem dados pessoais.


## Revisão obrigatória de escopo
O módulo 5 não encerra a entrega operacional. Leia também `docs/rga-plano-revisado.md`, que acrescenta a central de DISC/parecer, rotina de vagas e divulgação, propostas, financeiro, garantia e pós-admissão, além do aceite ponta a ponta. O plano revisado prevalece para o fechamento do escopo.
