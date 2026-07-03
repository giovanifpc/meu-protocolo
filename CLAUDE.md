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

Última atualização: 2026-07-03. Ver `ATUALIZACAO-2026-07-02.md` para o relato detalhado da sessão de setup de e-mail transacional.

**Já implementado:**
- Schema SQL: `supabase_01_professionals.sql`, `supabase_02_students.sql`, `supabase_03_auth_functions.sql` — já rodados no Supabase
- `supabase_04_fix_rls_recursion.sql` — corrige recursão infinita entre as policies de RLS de `professionals` e `students` (função `SECURITY DEFINER` isolando a leitura cruzada)
- `supabase_05_exercise_library.sql` — biblioteca de exercícios (seed de dados)
- `supabase_06_training.sql` — schema de protocolo de treino: `training_protocols` (rascunho/publicado/arquivado, `workouts` em JSONB) e `training_history` (sessões realizadas pelo aluno), RLS completo
- `supabase_07_search_fix.sql` — busca de exercício ignorando acento/maiúsculas (`unaccent`)
- `login.html` — OTP por e-mail (mesmo padrão do Fox, evita bug de PWA no iOS), roteia para `index.html` (profissional), `aluno.html` (aluno) ou `onboarding.html` (novo cadastro). Funcionando de ponta a ponta, incluindo o e-mail com código chegando via SMTP customizado
- `onboarding.html` — primeiro acesso do profissional cria a própria linha em `professionals` (trial de 14 dias)
- `index.html` — painel do profissional: banner de trial, cadastro rápido de aluno, lista de alunos
- `treinos.html` — montagem de protocolo de treino: busca de exercício, edição de sets/reps/descanso
- GIFs de exercício não animavam em navegador real (link direto do Google Drive falha ao decodificar como `<img>` com frequência) — corrigido replicando a técnica do Fox: 3 variações da URL do Drive (`uc?export=download`, `uc?export=view`, `thumbnail?sz=w900`) com fallback automático via `onerror`, aplicado no Overview e no Exec do `aluno.html`
- `supabase_08_nutrition.sql` — área Nutri: tabela `nutrition_guidance` (orientação em texto + referência do PDF, uma linha por aluno) e bucket privado de Storage `nutri-pdfs` (RLS por aluno, acesso só via signed URL — dado sensível de saúde). **Ainda não rodado no Supabase** (passo manual)
- `nutri.html` — tela do profissional: seleciona aluno, edita orientação em texto, envia/substitui PDF do plano nutricional
- `aluno.html` — aba "Nutri" (bottom nav): mostra a orientação atual e botão "Ver plano em PDF" (abre signed URL, expira em 5min). Funciona mesmo sem protocolo de treino publicado — `boot()` não bloqueia mais o app inteiro nesse caso, só a Home mostra o estado vazio
- `supabase_09_periodization.sql` — colunas `periodizacao` e `duracao_semanas` em `training_protocols`. **Ainda não rodado no Supabase** (passo manual)
- Periodização no `treinos.html`: dropdown com 6 técnicas (Linear, Ondulatória diária, Ondulatória semanal, Em blocos, Reversa, Manual) baseadas em pesquisa das práticas mais comuns do mercado (ver fontes no histórico da sessão). Botão "Aplicar periodização" gera automaticamente um array `weeks[]` (sets/reps/descanso por semana) por exercício a partir do valor atual como base — grade fica editável depois. Ondulatória diária é a exceção: em vez de variar por semana, varia por treino do loop (A=pesado, B=moderado, C=leve), já que o protocolo não tem calendário fixo. Exercícios sem periodização continuam com a UI simples de sempre (weeks com 1 item só)
- `aluno.html` reconhece a semana do ciclo (calculada a partir de `publicado_em` + `duracao_semanas`) e usa o `weeks[semana]` correto no Overview/Exec — com fallback pro formato antigo (`sets`/`reps`/`rest` direto no exercício) pra protocolos publicados antes dessa mudança. Home mostra "Semana X de Y" e banner de ciclo concluído quando aplicável
- E-mail transacional: domínio `meuprotocolo.app` (Cloudflare Registrar) verificado no Resend, SMTP customizado configurado no Supabase, templates "Confirm signup" e "Magic Link or OTP" editados com `{{ .Token }}`
- Bug de RLS que impedia o profissional recém-cadastrado de ler a própria linha após o onboarding (loop onboarding ↔ painel) — corrigido
- `aluno.html` — **app do aluno, Fases 1, 2 e 3 completas**: reescrito para replicar os recursos do Training da Fox Performance (repo `giovanifpc/fox-app`, arquivo `training.html`), só trocando a identidade visual pro tema claro do Meu Protocolo. Fase 1 — execução: Home (próximo treino do loop A/B/C..., estatísticas), Overview (pré-treino), Exec (séries, reps/carga com última carga pré-preenchida, timer de descanso por exercício), Finish (resumo + avaliação), tudo salvo em `training_history.detail` (JSONB, sem migration). Fase 2 — histórico: bottom nav, tela de Histórico com resumo, lista de treinos realizados e gráfico de evolução de carga por exercício (SVG, abas por exercício, exige ≥2 sessões com carga registrada pra aparecer). Fase 3 — Conquistas (9 badges computados a partir do histórico, com toast de "nova conquista" ao finalizar um treino que desbloqueia uma) e Perfil (nome, vínculo com o profissional, resumo de progresso, logout). Posição no loop e streak são calculados a partir do histórico no banco (sem depender de localStorage), diferente do Fox que usa `localStorage` como fonte da verdade — decisão deliberada pra funcionar corretamente entre dispositivos diferentes. Simplificações conscientes em relação ao Fox: sem conceito de ciclo/semana calendário, sem aquecimento/alongamento, sem exercício tipo cardio, sem grid de progresso semanal (específico da periodização de 8 semanas do Fox), sem geração de relatório PDF nem fluxo de "reiniciar ciclo"/compartilhar no WhatsApp (dependem de dados que o Meu Protocolo não tem — telefone do profissional, conceito de ciclo — e não foram pedidos), confirmações de saída/pendência usando `confirm()` nativo em vez de modal customizado
- Testado em produção (`meuprotocolo.app`) pelo usuário: fluxo completo de execução de treino e histórico rodando ponta a ponta

**Ainda não implementado (próximos passos):**
- Webhook Mercado Pago (cobrança automática ao fim do trial — trial deve exigir cartão cadastrado desde o cadastro, ver master doc seção 4)
- Chatbot de suporte via IA (item 1 do master doc)
- Configurações/branding do profissional (hoje `logo_url`/`primary_color`/`display_name` só existem no banco, sem tela pra editar)
- PWA completo (manifest, ícones, service worker)
- Política de Privacidade / Termos de Uso
- Rate limiting, headers de segurança, backup automático (item 13 do master doc)
- Painel/acesso master: master doc não pede CRUD de tenants, só 2FA + recuperação de emergência (item 14) — escopo exato de uma eventual visão agregada de métricas ainda não decidido com o usuário
- Nota: o master doc completo (`MEU-PROTOCOLO-MASTER.md`) só existe no PC do usuário — não está disponível em sessões remotas (celular/web) a menos que seja colado na conversa ou commitado no repo
