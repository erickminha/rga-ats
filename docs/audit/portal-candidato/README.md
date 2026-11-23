# RGA ATS — Evidências da Parte 4/6

Validação local com PostgreSQL, Chromium e SMTP restritos à máquina de teste. Os cadastros, as vagas, os endereços de e-mail e o currículo usados nas capturas são fictícios.

## Interface e fluxo

| Evidência | Resultado |
| --- | --- |
| [Portal em 1440 × 900](desktop.jpg) | Busca, filtros, URLs legadas, filtro adicional de área, contador, cópia do link e estado sem resultados. |
| [Detalhe em 390 × 844](mobile-390.jpg) | Marca da organização, localidade, modalidade, contratação, remuneração cadastrada, requisitos e chamada de candidatura sem rolagem horizontal. |
| [Candidatura em 320 × 700](mobile-320.jpg) | Validação em português, campos preservados após erro de arquivo e envio de currículo fictício válido. Preferências opcionais desmarcadas. |
| [Confirmação em 320 × 700](confirmacao.jpg) | Candidatura recebida e próxima ação visível. |
| [Acompanhamento em 320 × 700](acompanhamento.jpg) | Mensagem genérica ao solicitar o link. Acesso às candidaturas pelo link enviado por SMTP local e rejeição de token adulterado. |

A candidatura foi vinculada à vaga publicada com a origem de campanha informada. A tela e o SMTP local confirmaram o recebimento. O arquivo permaneceu protegido das rotas públicas. O banco registrou o processamento da candidatura separadamente das escolhas opcionais de conservação de perfil e divulgação na rede de talentos.

## Testes

- TypeScript, build completo e `git diff --check` passaram.
- 37 de 37 testes focados passaram em PostgreSQL local. A cobertura inclui o portal público, remetente de acompanhamento, arquivos, filtros antigos, separação de organizações, autorização de empresa, consentimentos e páginas de demonstração.
- Na suíte completa, 988 de 989 testes passaram. A asserção de data do adaptador Pinpoint continuou sendo a única falha reproduzida na base.
- O teste no Chromium conferiu URL canônica sem parâmetros de campanha, `JobPosting` com data registrada de publicação, página de vaga interna com resposta 404 e `noindex` nas páginas de confirmação e acompanhamento.

## Divulgação e SEO

- Em vagas de agência, a autorização é dada por administrador e fica vinculada à empresa e ao logotipo existentes quando salva. Se a empresa mudar, a autorização e o vínculo com o logotipo anterior são removidos. Um novo logotipo precisa ser autorizado. O logotipo institucional continua vindo da configuração da organização.
- As páginas, os feeds e os dados estruturados só incluem a identidade do cliente quando autorizada. A autorização fica no campo JSON de conteúdo da vaga. A Parte 4 não introduz uma migração Prisma.
- O esquema `JobPosting` usa o evento registrado de publicação e a descrição existente. Vagas que não tenham esses dados mantêm sua página pública sem esse esquema. A confirmação de candidatura, o portal privado e as demonstrações ficam fora do índice.
- Os e-mails de acompanhamento e o modelo original de confirmação foram traduzidos. Modelos personalizados continuam usando o texto cadastrado pela organização.
