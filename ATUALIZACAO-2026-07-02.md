# Atualização — 2026-07-02 (sessão celular)

Sessão iniciada como continuação de trabalho feito no PC. Foco: destravar o login por código OTP, que estava enviando link de confirmação em vez de código numérico.

---

## Causa raiz do problema de login

O Supabase só permite editar o **conteúdo** dos templates de e-mail (assunto/corpo) depois de configurar **SMTP customizado** — sem isso, ele usa o template padrão fixo, que só tem link de confirmação, nunca o código. Além disso, e-mails para usuário **novo** disparam o template "Confirm signup", enquanto e-mails para usuário **já existente** disparam "Magic Link or OTP" — os dois precisavam ser editados separadamente.

## O que foi feito (nessa ordem)

1. **Domínio registrado:** `meuprotocolo.app`, via Cloudflare Registrar.
2. **Conta Resend criada** (workspace `contatofoxperformance`) e domínio verificado — DNS (DKIM/SPF/DMARC) configurado via auto-integração Resend↔Cloudflare, sem precisar copiar registro manualmente.
3. **API Key do Resend criada** (`meu-protocolo-smtp`, permissão Full access — o dropdown de "Sending access" não abriu no navegador mobile, sem impacto funcional).
4. **SMTP customizado configurado no Supabase** (Authentication → Emails → SMTP Settings):
   - Host: `smtp.resend.com` · Porta: `465` · Usuário: `resend`
   - Sender: `contato@meuprotocolo.app` · Nome: `Meu Protocolo`
5. **Templates de e-mail editados** para incluir `{{ .Token }}` (Authentication → Emails → Templates):
   - `Confirm signup` (usuário novo)
   - `Magic Link or OTP` (usuário já existente — foi o que pegou nos testes, já que o e-mail de teste já tinha sido criado numa tentativa anterior)
6. **Site URL / Redirect URLs** conferidos — já apontavam pra `https://giovanifpc.github.io/meu-protocolo` (ajuste feito anteriormente, antes dessa sessão).
7. **Email OTP length** conferido: `8` dígitos no Supabase, bate com `maxlength="8"` do `login.html`. Nada a mudar.
8. **Teste de ponta a ponta:** login com código funcionando — e-mail chega com o código visível, `verifyOtp` valida, redireciona corretamente pro fluxo esperado.

## Bug novo encontrado (em aberto, próxima prioridade)

Ao testar o onboarding (`onboarding.html` → criar conta):
- O `insert` em `professionals` **funciona** (confirmado: reenviar o form deu erro `duplicate key value violates unique constraint "professionals_email_key"`, provando que a linha já existia).
- Mas logo após o redirect pra `index.html`, o `SELECT` que busca essa mesma linha (`index.html` linha ~92, `.from('professionals').select('*').eq('email', session.user.email).single()`) não encontra o registro e redireciona de volta pro `onboarding.html`.
- Suspeita: policy de RLS de `select` em `supabase_01_professionals.sql` (`"professional reads own row"`, usando `auth.jwt() ->> 'email'`) — **não confirmado ainda**.
- **Próximo passo de diagnóstico:** como a linha já existe pra esse e-mail de teste, navegar direto pra `index.html` (sem passar pelo onboarding) e ver se carrega o painel normalmente ou bate de volta no onboarding de novo. Isso isola se é bug persistente de RLS ou foi só uma falha pontual de timing no primeiro clique.

## Master doc revisado

O usuário compartilhou `MEU-PROTOCOLO-MASTER.md` (não estava disponível nessa sessão remota antes, vive só no PC local). Pontos relevantes pro que estava em discussão:

- **Não existe especificação de "3 níveis com painel admin completo"** no documento. A filosofia do produto é **baixa supervisão** — item 6 do escopo técnico exige que trial/cobrança sejam 100% automáticos, **sem ação manual no painel master**.
- A única exigência documentada sobre "painel master" é o item 14 (Plano de contingência de acesso): 2FA obrigatório, backup de credenciais, procedimento de recuperação de emergência. **Não é um CRUD de tenants.**
- Decisão em aberto, não resolvida: se o usuário quer, além disso, alguma visão agregada de métricas/tenants (não exigida pelo doc, mas cogitada na conversa). Precisa ser decidido antes de implementar.

## Outras notas operacionais

- Esse ambiente remoto tinha a política de rede bloqueando `api.supabase.com`, então não foi possível usar a Management API do Supabase pra automatizar/verificar configurações — tudo foi feito manualmente via dashboard mobile.
- Um token de acesso pessoal do Supabase (Management API) foi gerado e compartilhado pelo usuário durante a sessão, mas nunca chegou a ser usado com sucesso (bloqueado pela rede). **Recomendado revogar esse token** em https://supabase.com/dashboard/account/tokens caso ainda não tenha sido feito.

## Pendências não técnicas do master doc (fora do escopo dessa sessão, só registro)

- Política de Privacidade + Termos de Uso (bloqueante pro lançamento)
- Estrutura de recebimento formalizada (MEI dedicado ou alternativa) antes de tráfego pago
- Registro da marca "Meu Protocolo" no INPI
