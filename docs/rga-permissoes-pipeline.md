# Perfis de acesso e funil da RGA

## Permissões desta entrega

| Operação | Administrador principal | Administrador | Recrutadora / Recrutador | Acesso limitado | Entrevistador |
| --- | --- | --- | --- | --- | --- |
| Convidar, alterar perfil e ativar contas regulares | Sim | Sim | Restrito | Restrito | Restrito |
| Conceder ou retirar o perfil de administrador principal | Sim, preservando um titular ativo | Restrito | Restrito | Restrito | Restrito |
| Estrutura do funil, aprovação obrigatória, automações, chaves API e webhooks | Sim | Sim | Restrito | Restrito | Restrito |
| Criar e editar vagas, vincular empresa e gerenciar o plano de entrevistas | Sim | Sim | Sim, sujeito à política de publicação | Restrito | Restrito |
| Cadastrar e editar empresas e contatos comerciais da agência | Sim | Sim | Sim | Restrito | Restrito |
| Autorizar a divulgação do cliente e resolver uma aprovação de vaga pendente | Sim | Sim | Restrito | Restrito | Restrito |
| Cadastrar candidatos com currículo, mover etapas e registrar entrevistas | Sim | Sim | Sim | Restrito | Restrito |
| Consultas e avaliações já disponíveis aos perfis limitados | Conforme os fluxos existentes | Conforme os fluxos existentes | Conforme os fluxos existentes | Conforme os fluxos existentes | Conforme os fluxos existentes |

Alterar perfil, desativar ou reativar uma conta revoga as sessões anteriores na próxima requisição autenticada. Convites vinculam a pessoa à organização do administrador e geram a senha temporária pelo fluxo existente. A aprovação de vagas, quando habilitada, também reserva aos administradores a edição de detalhes de vagas já publicadas. Integrações pessoais existentes permanecem disponíveis a quem as usa. A autorização da API por chave mantém o escopo anterior. O cadastro manual aceita currículo de até 5 MB e preserva currículos já associados ao contato.

## Ativação na implantação autorizada

1. Configure `RGA_SINGLE_WORKSPACE=true` para fechar o cadastro público de organizações por senha ou Google. A opção também desativa a criação de organizações pela demonstração e pelos portais de exemplo. O padrão sem a variável preserva o comportamento original. Pessoas com conta ou convite continuam entrando, e a candidatura pública funciona normalmente.
2. Defina `RGA_WORKSPACE_ID` como o ID exato do registro de organização da agência RGA no ambiente. A opção habilita a reconciliação apenas para esse cadastro e identifica as etapas RGA para o agendamento automático.
3. Entre como administrador da organização e abra **Configurações → Recrutamento → Configurar funil RGA**. Leia e confirme a operação. A ação pode ser reexecutada com segurança. As variáveis, sozinhas, deixam a estrutura existente como está.

O modo de organização única fecha a criação pública. A estrutura de organizações, as contas existentes e o isolamento por organização continuam disponíveis. Empresas clientes continuam sendo cadastros comerciais.

## Ordem e preservação dos dados

| Ordem oficial | Etapa | Tipo |
| --- | --- | --- |
| 1 | Candidatura | `APPLICANT` |
| 2 | Triagem | `SCREEN` |
| 3 | Entrevista | `ONSITE` |
| 4 | Finalistas | `ONSITE` |
| 5 | Avaliação DISC | `ONSITE` |
| 6 | Parecer | `ONSITE` |
| 7 | Apresentação ao cliente | `ONSITE` |
| 8 | Contratação | `HIRED` |

A configuração reutiliza etapas canônicas com tipo compatível e os equivalentes do funil inicial `New applicant`, `Phone screen`, `On-site` e `Hired`. Mantém seus IDs, vínculos e transições. Prospecção fica no grupo anterior à Candidatura. Etapas adicionais, inclusive `Offer`, são preservadas e listadas após a configuração. Nomes ambíguos ou tipos incompatíveis interrompem a transação. O administrador pode revisar nomes antes de reexecutar. A configuração não move candidatos entre etapas nem altera vagas ativas.

A candidatura pública entra na primeira `APPLICANT`. Os movimentos continuam gerando transições. Contratação continua marcando a contratação e preenchendo a requisição vinculada quando aplicável. No funil RGA, o agendamento automático continua disponível em Triagem e Entrevista, conforme a configuração da organização. Finalistas, Avaliação DISC, Parecer e Apresentação ao cliente, com os nomes canônicos, não disparam convites. Os relatórios continuam agrupando etapas pelo tipo técnico. A reconciliação e a reordenação manual registram eventos no histórico de auditoria.

Esta entrega reaproveita `AccessRole`, `User.sessionVersion`, `Stage`, `StageTransition` e `Event` e não exige uma migração nova. A coluna `User.sessionVersion` é fornecida pelas migrações do Módulo 1.
