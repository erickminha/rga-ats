# RGA ATS — Recuperação de senha e e-mail

## Validação local

PostgreSQL e SMTP simulado no computador de teste. O navegador usou uma organização, equipe, vaga e candidatura fictícias.

1. Em **Entrar**, abra **Esqueci minha senha** e informe o e-mail da conta de teste. A resposta pública é a mesma para endereços cadastrados, desconhecidos e contas Google.
2. No SMTP simulado, abra a mensagem **Redefina sua senha do RGA ATS**. O token aparece apenas no fragmento inicial do link, que o navegador remove da barra de endereço. O banco guarda o hash e a expiração. O histórico do ATS não registra essa mensagem.
3. Cadastre a nova senha. Confirme que ela permite entrar, que a anterior falha e que o mesmo link não redefine outra vez. [Solicitação](solicitacao.jpg) · [Nova senha](nova-senha.jpg) · [Confirmação](senha-atualizada.jpg)
4. Abra uma vaga publicada e envie a candidatura fictícia com currículo. Confira no SMTP local a confirmação e a mensagem de acompanhamento. Abra o portal pelo link recebido. O histórico registra o estado do envio e omite o link individual.

Os testes automatizados cobrem expiração, uso único em concorrência, rejeição de conta desativada ou exclusivamente Google, duas contas com senha no mesmo e-mail, limite de três pedidos por endereço por hora e falha do SMTP em produção. O limite compartilhado é de 300 pedidos por hora por banco, sem depender de cabeçalhos informados pelo visitante. Sessões NextAuth já emitidas mantêm a validade original.

## Configuração para homologação após auditoria

- `RESEND_API_KEY` é a variável usada pelo Nodemailer para autenticar no SMTP da Resend. O servidor é `smtp.resend.com:465` com TLS. `SMTP_URL` tem precedência quando ambas estão definidas.
- `EMAIL_FROM` identifica o remetente. O valor planejado é `RGA ATS <notificacoes@consultoriarga.com.br>`. O domínio do remetente precisa estar autorizado na Resend.
- `AUTH_URL` deve ser a origem pública HTTPS que atende o RGA ATS. Ela serve de base para links de recuperação e acompanhamento enviados por e-mail. Mantenha `AUTH_SECRET` configurado como no restante da aplicação.
- No serviço `rga-ats` do projeto `rga-ats-homolog`, abra **Editar e implantar nova revisão** e, em **Contêineres → Variáveis e secrets**, adicione uma referência ao segredo existente `apikey_resend`. Use `RESEND_API_KEY` como nome da variável e selecione a versão ativa. A conta de serviço da revisão precisa ter acesso de leitura ao segredo. Não cole o valor da chave na configuração de variáveis em texto.
- A migração `20261124120000_password_reset` cria as tabelas de tokens e limites. Ela foi aplicada somente em PostgreSQL local. A primeira inicialização de uma revisão aprovada no Cloud Run aplica as migrações pendentes ao banco dessa revisão.

A entrega real via Resend deve ser conferida em homologação depois de conectar o segredo e o remetente. Nesta etapa, a validação de entrega usou exclusivamente o SMTP simulado.
