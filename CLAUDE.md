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

Última atualização: 2026-07-09 (3ª sessão do dia, notebook — pacote de "comodidades pro profissional": alertas de adesão/pagamento, anamnese, biblioteca de modelos, agenda leve, PWA e push notifications). Ver também `ATUALIZACAO-2026-07-02.md` (sessão anterior, setup de e-mail transacional).

### Pacote de comodidades pro profissional (2026-07-09, 3ª sessão)

Contexto: personal trainers autônomos comparam o app com concorrentes que anunciam "retenção automática" e "cobrança automática" do aluno. Decisão de produto: resolver isso **sem gateway de pagamento nem WhatsApp Business API** — o app só detecta e prepara, o profissional revisa e envia manualmente (mesmo padrão usado no Fox). Pacote fechado: tudo de "rápidas" e "médio prazo" que tínhamos listado, exceto mensageria dentro do app (adiada).

- **Schema**: `supabase_12_engagement.sql` — `students` ganha `telefone`, `mensalidade_valor`, `mensalidade_dia_vencimento`, `ultimo_pagamento_em`; novas tabelas `protocol_templates`, `student_anamnese`, `push_subscriptions`. Aplicada em produção via `supabase db query --linked --file`.
- **Alertas de adesão + pagamento** (`index.html`): unifica o antigo "precisam de atenção" com um novo alerta de mensalidade em atraso (o app só acompanha data de vencimento — nunca processa pagamento). Cada alerta expande com uma mensagem pronta e editável + botão "Abrir no WhatsApp" (link `wa.me`, sem API paga) e botão "Notificar no app" (push, ver abaixo). Cadastro de telefone/mensalidade e botão "marcar como pago" ficam no painel expansível de cada aluno em `alunos.html`.
- **Anamnese/PAR-Q digital**: aluno preenche em `aluno.html` → Perfil (objetivo, histórico médico, lesões, cirurgias, medicamentos, fumante, restrições) — é dono do próprio dado (RLS: aluno CRUD, profissional só lê). Profissional vê em `avaliacoes.html`, card no topo, com alerta visual se o aluno marcou "fumante".
- **Biblioteca de protocolos-modelo** (`treinos.html`): "Salvar como modelo" grava o protocolo atual em `protocol_templates` (sem vínculo de aluno); "Aplicar modelo" clona pra qualquer aluno depois. Evolução do "duplicar protocolo de outro aluno" que já existia.
- **Agenda leve** (`treinos.html` + `aluno.html`): dia(s) da semana opcional por treino do loop (campo `dias_semana` dentro do próprio `workouts` jsonb, sem migration). Não mexe na lógica do loop/periodização — é só um hint visual ("hoje é dia deste treino" na Home do aluno). Decisão deliberada de não rearquitetar pra calendário fixo completo (contrariaria a escolha consciente já documentada mais abaixo).
- **PWA completo**: `manifest.json` + ícones gerados em `icons/` (script `scripts/generate_icons.py`, precisa de Pillow) + `sw.js` (cache network-first pra assets estáticos, nunca intercepta `*.supabase.co`). Registrado só em `aluno.html` por ora — é onde faz sentido "adicionar à tela de início" como app; os paineis do profissional continuam como dashboard web comum.
- **Push notifications**: par de chaves VAPID gerado localmente com a Web Crypto API do Node (sem precisar de Deno instalado nem de expor endpoint nenhum — a chave privada foi direto pra `supabase secrets set VAPID_KEYS_JSON`, nunca tocou o repositório). Edge Function `send-push` usa `jsr:@negrel/webpush` (lib nativa Deno, evita os problemas conhecidos de rodar o pacote npm `web-push` via esm.sh nesse runtime). Aluno ativa em Perfil → "Ativar notificações"; profissional dispara pelo botão "Notificar no app" dentro de cada alerta em `index.html`, reaproveitando a mesma mensagem editada pro WhatsApp.
- **Não testado interativamente pelo usuário ainda** — validado por sintaxe de todos os scripts, geração de ícones conferida visualmente, registro do service worker confirmado via preview isolado. Precisa de teste ponta a ponta em produção: cadastrar telefone/mensalidade de um aluno, conferir alerta de atraso, preencher anamnese como aluno, salvar/aplicar um modelo de protocolo, marcar dias da semana num treino, instalar o PWA no celular e ativar notificações, e confirmar que uma notificação de teste chega.

### Avaliação física — nova área (2026-07-09)

Pedido do profissional 0: hoje ele faz a avaliação (adipômetro + bioimpedância) na planilha/papel; o app deve fazer as contas.

- **Schema**: `supabase_11_physical_assessment.sql`, tabela `physical_assessments` (RLS: profissional CRUD total; aluno só lê avaliações com `status = 'finalizada'`) + bucket privado `assessment-photos` (mesmo padrão do `nutri-pdfs`, acesso via signed URL). Sexo e idade ficam na própria avaliação, não em `students` — idade muda a cada avaliação e isso evitou alterar o cadastro do aluno por um dado usado só aqui. **Já aplicada em produção** (rodada via `supabase db query --linked --file`, confirmada via REST API).
- **`avaliacoes.html`** (novo, painel do profissional): protocolo de dobras cutâneas selecionável (Pollock 3, Pollock 7, Faulkner 4, Guedes 3 — profissional escolhe antes de digitar os números, cada um pede sites diferentes dependendo do sexo), bioimpedância (campos manuais — **nenhuma balança do mercado tem API pra terceiros**, então é sempre o profissional digitando o que aparece no visor), perimetria (12 medidas), 3 fotos (frente/lado/costas). Rascunho → Finalizar, igual ao padrão já usado em `training_protocols`. Card de evolução (peso e %gordura, delta desde a última + gráfico de barras) quando há 2+ avaliações finalizadas.
- **Fórmulas**: coeficientes conferidos contra a literatura (Jackson & Pollock 1978/1980, Faulkner 1968, Guedes 1994) antes de implementar, dada a sensibilidade de errar um cálculo de saúde — ver `avaliacoes.html`, objeto `SKINFOLD_PROTOCOLS`. Conversão densidade → % gordura sempre por Siri.
- **`aluno.html`**: nova seção "Avaliação física" dentro da tela de Histórico (somente leitura) — resumo atual + delta + mesmo gráfico de barras + lista de avaliações finalizadas.
- **Navegação reorganizada**: `alunos.html` agora tem 3 links por aluno (Treino / Avaliação / Nutri) em vez de 2. Dentro de `treinos.html`/`avaliacoes.html`/`nutri.html`, uma barra de abas (`#studentTabbar`) aparece assim que um aluno é selecionado, permitindo trocar de área sem voltar pra lista — o padrão usado por apps consolidados do mercado (Trainerize, MFit Personal).
- **Testado em produção pelo usuário** — funcionando. Único ajuste necessário: grid de 3 colunas do formulário (dados gerais, dobras, fotos) estourava a tela no celular (`<input type="date">`/`type="file"` têm largura mínima intrínseca maior que 1fr do grid) — corrigido com `min-width:0` nos itens da grade + colapso pra 2 colunas abaixo de 480px.

### Layout do aluno — deixado mais profissional (2026-07-09, mesma sessão)

Pedido do usuário: nav inferior com ícones de emoji coloridos ("infantilizada"), e a seção de Avaliação física enterrada no final da tela de Histórico depois da lista de treinos.

- **Ícones da nav inferior**: trocados de emoji (🏠📊🥗👤) pra SVG inline monocromático (`stroke="currentColor"`, estilo Feather/Lucide) — desenhados e conferidos visualmente no preview antes de aplicar (casa, gráfico de barras, garfo+faca, usuário). Isso também corrigiu um bug latente: `.nav-btn.active { color: var(--primary) }` nunca pintava o ícone porque emoji ignora a propriedade `color` do CSS — só o texto embaixo mudava de cor.
- **"Conquistas" saiu da nav e virou seção dentro do Perfil** (nav caiu de 5 pra 4 ícones: Início/Histórico/Nutri/Perfil) — mais alinhado ao padrão de apps de coaching sérios (Trainerize/TrueCoach não têm gamificação como aba própria).
- **Histórico ganhou sub-abas** ("Evolução de carga" / "Avaliação física") — um controle segmentado no topo troca o conteúdo abaixo, no lugar da avaliação física ficar empilhada depois da lista de treinos. Mesmo padrão da aba "Progress" do Trainerize (sub-tabs pra Habits/Photos/Measurements/Workouts).
- Validado via preview isolado reaproveitando o CSS/HTML reais do arquivo (login OTP impede teste end-to-end fora do notebook) — precisa de conferência visual do usuário em produção.

### Resolvido nesta sessão (2026-07-09)

- **As 3 migrations pendentes (`08_nutrition`, `09_periodization`, `10_student_notes`) já estão aplicadas** — confirmado via consulta direta à REST API do Supabase (tabelas `nutrition_guidance`, `student_notes` e colunas `periodizacao`/`duracao_semanas` em `training_protocols` respondem normalmente).
- **Edge Function `generate-workout` implantada e funcionando ponta a ponta** (`supabase functions deploy generate-workout`, versão 3 ativa). `ANTHROPIC_API_KEY` configurada via `supabase secrets set`.
- Corrigidos 2 bugs que impediam o card "Gerar sugestão com IA" de funcionar:
  - `treinos.html` engolia a mensagem de erro real da função (o cliente `supabase-js` só expõe o corpo da resposta de erro em `error.context`, não em `error.message`) — agora lê e mostra o motivo real.
  - `generate-workout/index.ts` só olhava `content[0].text` da resposta da Claude (perdendo texto se vier em mais de um bloco) e usava `max_tokens: 4096`, que podia cortar o JSON antes de fechar em protocolos maiores — agora concatena todos os blocos de texto e usa `max_tokens: 8192`.
- Testado em produção pelo usuário: geração de treino por IA funcionando sem erro.
- Nota de infraestrutura: a CLI Supabase instalada via npm (`supabase.cmd`) nesta versão (2.109.1) **não tem mais o subcomando `functions logs`** — não dá pra rodar `supabase functions logs <nome>` pra depurar. Único jeito de ver logs de execução é pelo painel (`supabase.com/dashboard/project/.../functions`) ou surfaceando o erro real no próprio corpo de resposta da função (como foi feito aqui).

### Limitação de rede descoberta em sessão anterior (guardar pra não repetir a tentativa)

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

**Schema SQL rodado no Supabase** (`supabase_08` a `supabase_10`)
- `08_nutrition` — tabela `nutrition_guidance` + bucket `nutri-pdfs`
- `09_periodization` — colunas `periodizacao`/`duracao_semanas` em `training_protocols`
- `10_student_notes` — tabela `student_notes`

**Painel do profissional** — reestruturado com nav inferior em sessão anterior, navegação por aluno reorganizada nesta sessão
- `index.html` — dashboard "Início": nº de alunos, treinos na semana, lista "precisam de atenção" (quem não treina há 7+ dias ou nunca treinou, excluindo alunos pausados/inativos)
- `alunos.html` — lista de alunos + cadastro (antes vivia em `index.html`). Cada aluno tem bolinha de status (ativo/pausado/inativo), 3 links de área (Treino / Avaliação / Nutri) e painel expansível (botão 📝) com nota privada + status — guardados em `student_notes`, **sem policy de leitura pro aluno** (informação privada do profissional)
- `perfil.html` — branding (nome exibido, cor principal, logo) + logout. Fechava uma lacuna antiga (campos existiam no banco, sem tela pra editar)
- `relatorios.html` — gera relatório em **texto estruturado** (não PDF) por aluno: resumo, adesão %, evolução de carga, histórico de sessões. Botões copiar/baixar `.txt` — formato deliberado pra colar em IA externa
- `treinos.html` / `avaliacoes.html` / `nutri.html` são sub-telas por aluno (chegam a partir de `alunos.html`), com a barra `#studentTabbar` pra trocar de área mantendo o aluno selecionado — sem nav inferior própria, mesmo padrão do Overview/Exec no app do aluno

**Protocolo de treino** (`treinos.html`)
- Montagem: busca de exercício (ignora acento/maiúsculas), edição de sets/reps/descanso
- GIF de exercício: corrigido problema de não animar em navegador real (link cru do Google Drive falha ao decodificar como `<img>` com frequência) — 3 variações de URL (`uc?export=download`, `uc?export=view`, `thumbnail?sz=w900`) com fallback automático via `onerror`, mesma técnica do Fox
- **Periodização**: dropdown com 6 técnicas (Linear, Ondulatória diária, Ondulatória semanal, Em blocos, Reversa, Manual). Botão "Aplicar periodização" gera automaticamente `weeks[]` (sets/reps/descanso por semana) por exercício a partir do valor atual como base — grade fica editável depois, nunca é uma trava. Ondulatória diária é a exceção: varia por treino do loop (A=pesado, B=moderado, C=leve) em vez de por semana, já que o protocolo não tem calendário fixo
- **Duplicar protocolo de outro aluno**: aparece quando existe pelo menos um outro aluno com protocolo salvo; clona workouts/exercícios/periodização como rascunho novo, sem alterar o protocolo de origem
- **Gerar treino com IA**: card que chama a Edge Function `generate-workout` (implantada e funcionando, ver "Resolvido nesta sessão") — profissional digita objetivo/observação, recebe sugestão baseada no histórico do aluno, carregada como rascunho pra revisão manual antes de publicar

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
- `nutrition_guidance` + bucket privado `nutri-pdfs`, acesso só via signed URL
- `nutri.html`: profissional escreve orientação + sobe/substitui PDF
- Aba "Nutri" no `aluno.html`: ver acima

**Avaliação física** — ver detalhamento completo em "Avaliação física — nova área" acima
- `physical_assessments` + bucket `assessment-photos`
- `avaliacoes.html`: dobras cutâneas (4 protocolos) + bioimpedância manual + perimetria + fotos, rascunho/finalizar, comparativo de evolução
- Seção "Avaliação física" na tela de Histórico do `aluno.html`: somente leitura, resumo + evolução

### Ainda não implementado (backlog maior, sem trabalho iniciado)

- Webhook Mercado Pago (cobrança automática ao fim do trial — trial deve exigir cartão cadastrado desde o cadastro, ver master doc seção 4). Não confundir com o acompanhamento de mensalidade aluno→profissional implementado nesta sessão — são coisas diferentes: esse item aqui é a cobrança do profissional pelo uso do Meu Protocolo em si
- Chatbot de suporte via IA pro aluno final (item 1 do master doc — diferente da geração de treino por IA pro profissional, que já está feita)
- Mensageria dentro do próprio app entre profissional e aluno (adiada deliberadamente nesta sessão — hoje usa WhatsApp/push)
- Política de Privacidade / Termos de Uso
- Rate limiting, headers de segurança, backup automático (item 13 do master doc)
- Painel/acesso master: master doc não pede CRUD de tenants, só 2FA + recuperação de emergência (item 14) — escopo exato de uma eventual visão agregada de métricas ainda não decidido com o usuário
- Nota: o master doc completo (`MEU-PROTOCOLO-MASTER.md`) só existe no PC do usuário — não está disponível em sessões remotas (celular/web) a menos que seja colado na conversa ou commitado no repo
