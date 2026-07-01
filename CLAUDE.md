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

- **Branch principal:** `main` — commits vão direto para a main
- **RLS sempre habilitado** em toda tabela nova, sem exceção — dado sensível de saúde (LGPD), multi-tenant real
- **Nunca usar `--no-verify` ou forçar push destrutivo sem confirmação explícita**
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

Projeto em setup inicial (2026-07-01): repositório e projeto Supabase criados.

**Já implementado:**
- Schema SQL: `supabase_01_professionals.sql`, `supabase_02_students.sql`, `supabase_03_auth_functions.sql` — **rodar em ordem numérica** no SQL Editor do Supabase (auth_functions depende de students já existir, students depende de professionals)
- `login.html` — OTP por e-mail (mesmo padrão do Fox, evita bug de PWA no iOS), roteia para `index.html` (profissional), `aluno.html` (aluno) ou `onboarding.html` (novo cadastro)
- `onboarding.html` — primeiro acesso do profissional cria a própria linha em `professionals` (trial de 14 dias)
- `index.html` — painel do profissional: banner de trial, cadastro rápido de aluno, lista de alunos
- `aluno.html` — placeholder do aluno (mostra branding do profissional via `primary_color`/`display_name`, aguardando protocolo publicado)

**Ainda não implementado (próximos passos):**
- Rodar o SQL no Supabase (passo manual — Code não tem credenciais de DB)
- Protocolo de treino (schema + tela) — reaproveitar formato JSON validado no Fox como ponto de partida
- Webhook Mercado Pago (cobrança automática ao fim do trial)
- Chatbot de suporte via IA (item 1 do master doc)
- PWA completo (manifest, ícones, service worker)
- Política de Privacidade / Termos de Uso
- Rate limiting, headers de segurança, backup automático (item 13 do master doc)
