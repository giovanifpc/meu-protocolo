# Meu Protocolo — Contexto do Projeto

## O que é este app

SaaS B2B2C de gestão para **personal trainers autônomos brasileiros**. O profissional assina um plano, gerencia seus alunos e entrega um app com branding próprio (white-label lite) ao aluno final. Diferencial central: suporte 24/7 via IA, sem fila de ticket.

Produto **totalmente separado da marca Fox Performance** — projetos distintos, sem mistura de dados, marca ou branding.

- **Documento master (planejamento de negócio):** `C:\Users\Giovani\Documents\Meu Ciclo\MEU-PROTOCOLO-MASTER.md` — ler antes de qualquer sessão de desenvolvimento. Decisões estratégicas ali são definições fechadas, não sugestões.
- **Repositório:** https://github.com/giovanifpc/meu-protocolo
- **Backend:** Supabase (`https://yumqmramxbahkfxsthtt.supabase.co`)
- **Stack:** HTML + CSS + JS puro (sem framework), Supabase Auth + DB (RLS multi-tenant), Mercado Pago (webhook), Claude API (suporte IA), GitHub Pages

---

## Regras de desenvolvimento

- **Branch principal:** `main` — todo commit vai direto para a main
- **GitHub Pages** serve a main automaticamente — mudanças ficam ao vivo após push
- **Domínio de produção:** `https://meuprotocolo.app` (Cloudflare Registrar). Fallback: `https://giovanifpc.github.io/meu-protocolo`
- **E-mail transacional:** SMTP customizado via Resend configurado no Supabase (Authentication → Emails → SMTP Settings), sender `contato@meuprotocolo.app`. Templates "Confirm signup" e "Magic Link or OTP" incluem `{{ .Token }}` — é isso que faz o OTP chegar como código numérico em vez de link mágico
- **No PC (Windows):** edições via PowerShell/terminal + `git pull` para sincronizar após commits feitos em outro lugar
- **Aqui (Claude Code web/celular):** faço edições, commit e push direto na main
- **RLS sempre habilitado** em toda tabela nova, sem exceção — dado sensível de saúde (LGPD), multi-tenant real
- **Nunca usar `--no-verify` ou forçar push destrutivo sem confirmação explícita**
- **Autonomia de execução:** o Giovani pediu operação sem pausas de confirmação — faça o commit e push das mudanças diretamente, sem perguntar "posso commitar?" a cada passo. Vale para qualquer sessão (PC, web, celular), não só a que recebeu essa instrução originalmente. Só pare pra confirmar em ações genuinamente arriscadas: alterar/apagar dado real de aluno ou profissional (não teste), mudar configuração de cobrança real, ou qualquer coisa irreversível fora do fluxo normal de código
- Commits em português, mensagens descritivas
- Sem TypeScript no frontend (só seria usado, se necessário, em Edge Functions)

---

## Modelo de dados — multi-tenant

- `professionals` — conta do personal trainer (tenant). Campos de branding: `logo_url`, `primary_color`, `display_name`. Estado da assinatura: `trial` → `ativo` → `inativo` → `deletado`.
- `students` — aluno vinculado a um `professional_id`. Um aluno pertence a exatamente um profissional.
- Toda tabela de dados de aluno (protocolos, histórico de treino, etc.) referencia `professional_id` **e** `student_id` — RLS filtra por ambos.
- Vocabulário de tabelas em inglês (mesmo padrão adotado no projeto irmão Fox Performance), textos/comentários em português.

---

## Identidade visual

```css
:root {
  --bg:#F8F9FA;
  --primary:#2D6BE4;
  --accent:#3BB08F;
  --text:#1E2A3A;
  --font:'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}
```

Fonte **Inter** via Google Fonts — pesos 400 (corpo), 500 (labels), 700 (títulos). Paleta é o padrão do plano Starter — sobrescrita pelo white-label lite (`professionals.logo_url` / `primary_color`) nos planos Pro/Elite.

---

## Planos (referência rápida — ver master doc para detalhes)

| Plano | Preço | Alunos | Branding |
|---|---|---|---|
| Starter | R$79/mês | até 15 | padrão Meu Protocolo |
| Pro | R$139/mês | até 40 | white-label lite |
| Elite | R$249/mês | ilimitado | white-label lite + IA de interpretação de relatório |

---

## Arquitetura de replicabilidade (item 17 do master doc)

O código-base, sistema de pagamento, chatbot IA e onboarding devem ser projetados desde o início como template replicável por nicho (próxima instância planejada: fisioterapia). Isso significa: nomes de tabela/schema não devem ser específicos de "personal trainer" quando um nome genérico servir igualmente bem, e configurações por instância (MD de contexto da IA, biblioteca de exercícios, branding) devem ficar isoladas, não hardcoded.

---

## Segurança (desde o MVP, não depois)

- Rate limiting em login
- Tokens de sessão com expiração
- Validação de webhook do Mercado Pago via assinatura HMAC
- Headers HTTP de segurança (HSTS, CSP, X-Frame-Options)
- Sanitização de inputs contra SQL/XSS
- Backup automático do banco Supabase

---

## Status atual

Última atualização: 2026-07-07 (sessão longa via celular/web — ver detalhamento completo abaixo). Ver também `ATUALIZACAO-2026-07-02.md` (sessão anterior, setup de e-mail transacional).

### ⚠️ Pendências imediatas — retomar no notebook

Tudo abaixo já está commitado e com o front-end no ar em produção, mas depende de passos manuais que só dá pra fazer com acesso de terminal (Supabase CLI) ou direto no painel do Supabase. Nenhuma sessão remota (celular/web) consegue completar isso — ver "Limitação de rede" mais abaixo.

1. **Rodar 3 migrations SQL pendentes no SQL Editor do Supabase**, em ordem:
   - `supabase_08_nutrition.sql` (tabela `nutrition_guidance` + bucket `nutri-pdfs`)
   - `supabase_09_periodization.sql` (colunas `periodizacao`/`duracao_semanas` em `training_protocols`)
   - `supabase_10_student_notes.sql` (tabela `student_notes`)
   - (Se alguma já tiver sido rodada manualmente entre sessões, `create table if not exists` faz as outras rodarem sem erro mesmo repetindo.)
2. **Deploy da Edge Function de geração de treino por IA** (só funciona com a CLI local, testado e confirmado que não dá pra fazer de sessão remota):
   ```
   cd meu-protocolo
   supabase link --project-ref yumqmramxbahkfxsthtt
   supabase functions deploy generate-workout
   supabase secrets set ANTHROPIC_API_KEY=<chave da Anthropic — pode reaproveitar a mesma já usada no projeto Fox>
   ```
3. **Segurança**: um Supabase Personal Access Token (`sbp_...`) foi gerado e colado no chat nesta sessão pra eu tentar fazer o deploy remotamente (não funcionou — ver limitação abaixo). **Confirmar que foi revogado** em `supabase.com/dashboard/account/tokens`, se ainda não foi.
4. Depois do deploy: testar em `treinos.html` → selecionar aluno → "Gerar sugestão com IA".

### Limitação de rede descoberta nesta sessão (guardar pra não repetir a tentativa)

Sessões remotas (celular/web) rodam num sandbox com todo tráfego HTTPS saindo por um proxy da Anthropic. Ferramentas que respeitam `HTTPS_PROXY` (curl, npm, node fetch) funcionam normalmente — por isso deu pra rodar `npm install -g supabase` e alcançar `api.supabase.com` via curl (200 OK). Mas o **binário da Supabase CLI é Go compilado que ignora as variáveis de proxy** — `supabase link`/`deploy` falham com erro de rede mesmo com o token de acesso correto. Uma tentativa de forçar a rota via `proxychains` foi **ativamente recusada pelo proxy** ("method CONNECT not permitted") — é bloqueio de política, não bug, então não vale tentar contornar de novo. Conclusão prática: **qualquer comando `supabase` que fale com a API remota (`link`, `functions deploy`, `secrets set`, `db push` contra o projeto remoto) só funciona rodando localmente** (notebook, onde a CLI já funciona bem pro projeto Fox) ou numa sessão de Claude Code que rode nesse ambiente local. SQL direto (colar no SQL Editor do navegador) e o próprio deploy do site (GitHub Pages) não têm esse problema — continuam funcionando normal de qualquer sessão.

### Deploy do GitHub Pages — instabilidade observada

Duas vezes nesta sessão o deploy automático (`pages build and deployment`) falhou com erro transitório de infraestrutura do GitHub ("Deployment failed, try again later"), sem relação com o conteúdo do commit (o job de build sempre passou normal, só o job de deploy falhou). **Conserto que funcionou nas duas vezes**: criar um commit vazio (`git commit --allow-empty`) e dar push — isso dispara uma rodada nova de build+deploy do zero e resolve. Se o site não atualizar alguns minutos depois de um push, checar `github.com/giovanifpc/meu-protocolo/actions` antes de assumir que é bug no código.

### Já implementado, por área

**Auth / onboarding** (sessões anteriores)
- `login.html` — OTP por e-mail, roteia pra `index.html` (profissional), `aluno.html` (aluno) ou `onboarding.html` (novo cadastro). Funcionando ponta a ponta com SMTP customizado (Resend)
- `onboarding.html` — primeiro acesso do profissional cria a própria linha em `professionals` (trial de 14 dias)
- E-mail transacional: domínio `meuprotocolo.app` verificado no Resend, SMTP configurado no Supabase, templates com `{{ .Token }}`
- Bug de RLS do loop onboarding↔painel — corrigido

**Schema SQL rodado no Supabase** (`supabase_01` a `supabase_07`)
- `01_professionals`, `02_students`, `03_auth_functions` — base multi-tenant
- `04_fix_rls_recursion` — corrige recursão infinita de RLS entre `professionals`/`students`
- `05_exercise_library` — biblioteca de exercícios (seed, ~1550 itens, reaproveitados do Fox)
- `06_training` — `training_protocols` + `training_history`, RLS completo
- `07_search_fix` — busca de exercício ignorando acento (`unaccent`)

**Schema SQL escrito mas NÃO rodado ainda** (ver checklist de pendências no topo)
- `08_nutrition`, `09_periodization`, `10_student_notes`

**Painel do profissional** — reestruturado com nav inferior nesta sessão
- `index.html` — dashboard "Início": nº de alunos, treinos na semana, lista "precisam de atenção" (quem não treina há 7+ dias ou nunca treinou, excluindo alunos pausados/inativos)
- `alunos.html` — lista de alunos + cadastro (antes vivia em `index.html`). Cada aluno tem bolinha de status (ativo/pausado/inativo) e painel expansível (botão 📝) com nota privada + status — guardados em `student_notes`, **sem policy de leitura pro aluno** (informação privada do profissional)
- `perfil.html` — branding (nome exibido, cor principal, logo) + logout. Fechava uma lacuna antiga (campos existiam no banco, sem tela pra editar)
- `relatorios.html` — gera relatório em **texto estruturado** (não PDF) por aluno: resumo, adesão %, evolução de carga, histórico de sessões. Botões copiar/baixar `.txt` — formato deliberado pra colar em IA externa
- `treinos.html` / `nutri.html` continuam como sub-telas por aluno (chegam a partir de `alunos.html`), sem nav inferior própria — mesmo padrão do Overview/Exec no app do aluno

**Protocolo de treino** (`treinos.html`)
- Montagem: busca de exercício (ignora acento/maiúsculas), edição de sets/reps/descanso
- GIF de exercício: corrigido problema de não animar em navegador real (link cru do Google Drive falha ao decodificar como `<img>` com frequência) — 3 variações de URL (`uc?export=download`, `uc?export=view`, `thumbnail?sz=w900`) com fallback automático via `onerror`, mesma técnica do Fox
- **Periodização**: dropdown com 6 técnicas (Linear, Ondulatória diária, Ondulatória semanal, Em blocos, Reversa, Manual). Botão "Aplicar periodização" gera automaticamente `weeks[]` (sets/reps/descanso por semana) por exercício a partir do valor atual como base — grade fica editável depois, nunca é uma trava. Ondulatória diária é a exceção: varia por treino do loop (A=pesado, B=moderado, C=leve) em vez de por semana, já que o protocolo não tem calendário fixo
- **Duplicar protocolo de outro aluno**: aparece quando existe pelo menos um outro aluno com protocolo salvo; clona workouts/exercícios/periodização como rascunho novo, sem alterar o protocolo de origem
- **Gerar treino com IA**: card que chama a Edge Function `generate-workout` (ver pendência de deploy no topo) — profissional digita objetivo/observação, recebe sugestão baseada no histórico do aluno, carregada como rascunho pra revisão manual antes de publicar

**App do aluno** (`aluno.html`) — reescrito nesta sessão pra ter paridade de recursos com o Training da Fox (repo `giovanifpc/fox-app`), com a identidade visual clara do Meu Protocolo
- Fase 1 (execução): Home (próximo treino do loop, estatísticas), Overview (pré-treino), Exec (séries, reps/carga com última carga pré-preenchida, timer de descanso), Finish (resumo + avaliação) — tudo em `training_history.detail` (JSONB)
- Fase 2 (histórico): bottom nav, tela de Histórico (resumo, lista de treinos, gráfico de evolução de carga por exercício em SVG)
- Fase 3 (conquistas/perfil): 9 badges com toast de desbloqueio, tela de Perfil
- Reconhece a semana do ciclo (a partir de `publicado_em` + `duracao_semanas`) e usa `weeks[semana]` correto — com fallback pro formato antigo (protocolos publicados antes da periodização existir continuam funcionando sem migração de dado)
- Aba "Nutri": orientação em texto + botão "Ver plano em PDF" (signed URL, expira em 5min). Funciona mesmo sem protocolo de treino publicado ainda — `boot()` não bloqueia mais o app inteiro nesse caso
- Loop de treinos e streak calculados a partir do histórico no banco (não `localStorage`) — decisão deliberada pra funcionar entre dispositivos diferentes, diferente do Fox
- Simplificações conscientes vs. Fox: sem ciclo/semana calendário fixo (a periodização já resolve isso de outro jeito), sem aquecimento/alongamento, sem exercício tipo cardio, sem grid de progresso semanal do Fox, sem relatório PDF nem "reiniciar ciclo"/WhatsApp do Fox (dependem de dado que não existe aqui — telefone do profissional, conceito de ciclo — e não foram pedidos), `confirm()` nativo em vez de modal customizado
- Testado em produção pelo usuário: execução de treino, histórico e Nutri rodando ponta a ponta

**Área Nutri**
- `nutrition_guidance` (schema pendente de rodar — item 8 da lista) + bucket privado `nutri-pdfs`, acesso só via signed URL
- `nutri.html`: profissional escreve orientação + sobe/substitui PDF
- Aba "Nutri" no `aluno.html`: ver acima

### Ainda não implementado (backlog maior, sem trabalho iniciado)

- Webhook Mercado Pago (cobrança automática ao fim do trial — trial deve exigir cartão cadastrado desde o cadastro, ver master doc seção 4)
- Chatbot de suporte via IA pro aluno final (item 1 do master doc — diferente da geração de treino por IA pro profissional, que já está feita)
- PWA completo (manifest, ícones, service worker)
- Política de Privacidade / Termos de Uso
- Rate limiting, headers de segurança, backup automático (item 13 do master doc)
- Painel/acesso master: master doc não pede CRUD de tenants, só 2FA + recuperação de emergência (item 14) — escopo exato de uma eventual visão agregada de métricas ainda não decidido com o usuário
- Nota: o master doc completo (`MEU-PROTOCOLO-MASTER.md`) só existe no PC do usuário — não está disponível em sessões remotas (celular/web) a menos que seja colado na conversa ou commitado no repo
