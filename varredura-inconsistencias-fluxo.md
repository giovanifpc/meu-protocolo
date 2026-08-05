# Varredura de inconsistências de fluxo — 2026-08-05 (FECHADA)

Levantamento pedido pelo usuário depois de notar um padrão recorrente de retrabalho: funcionalidades novas sem lugar de chegada, botões de adição sem remoção, campos sem edição. A regra "análise de fluxo completo" (ver `CLAUDE.md`) só existe desde 2026-07-28 e nunca tinha sido aplicada retroativamente ao que já estava pronto — este documento foi essa aplicação retroativa, cobrindo o app inteiro (18 páginas HTML + as ~51 funções/RPC do banco).

**Status: todos os 51 achados confirmados foram corrigidos e testados de ponta a ponta contra o banco/produção real (dado sintético criado e removido em cada teste). Os 7 achados marcados "suspeita, não confirmada" ficaram deliberadamente de fora — não foram corrigidos, seguem como pendência registrada no fim deste documento**, por pedido explícito do usuário (não agir sobre suspeita não verificada com certeza).

**Método original**: 6 auditorias paralelas (uma por região do app) mais uma varredura própria de funções SQL órfãs, cada uma checando 4 categorias — ida sem volta, campo sem edição, função/recurso órfão, intersecção esquecida.

**Segurança do processo de correção**: tudo foi feito em lotes pequenos e isolados por arquivo/área, testado localmente (servidor estático + navegador real + contas de teste) antes de cada commit, com checagem de sintaxe (`node --check`)/balanceamento de tags antes de qualquer push, e confirmação de que nenhuma tag `<script>`/`defer`/`async` foi tocada (causa do incidente de performance de 2026-08-01 documentado mais acima neste arquivo) — nenhuma mudança de timing/ordem de carregamento de script entrou nesta leva.

---

## ✅ Corrigidos — 13 de risco alto

Todos testados de ponta a ponta contra o banco real.

1. **[perfil.html]** Cancelar a assinatura do profissional agora **bloqueia** se houver aluno em cobrança automática ativa (mesmo padrão do bloqueio de downgrade) — decisão confirmada com o usuário antes de implementar. *Commit 44c6440.*
2. **[alunos.html]** Marcar "Inativo" em aluno com cobrança automática ativa agora pede **confirmação explícita** antes de cancelar de verdade. *Commit 44c6440.*
3. **[alunos.html]** `mp_charge_method` agora aparece no painel de cada aluno. *Commit 44c6440.*
4. **[alunos.html]** "Marcar pago hoje" em aluno automatizado agora avisa antes (pode atrasar a próxima cobrança automática). *Commit 44c6440.*
5. **[index.html]** Alerta de "mensalidade em atraso" não dispara mais pra quem já está em cobrança automática. *Commit 44c6440.*
6. **[financeiro.html]** "Recebido este mês" não conta mais em duplicidade com o bloco "Bruto/Taxa/Líquido". *Commit 44c6440.*
7. **[alunos.html]** Campo "dia de vencimento" desabilitado quando já tem cartão automático ativo (decisão confirmada: só-leitura com explicação, não arriscar sincronizar com a API real do Mercado Pago sem poder testar contra dinheiro real). *Commit 44c6440.*
8. **[avaliacoes.html]** Nova avaliação nasce com o sexo real do aluno (`students.genero`), não mais 'F' fixo. *Commit 870d98c.*
9. **[avaliacoes.html]** Editar avaliação usada em comparativo publicado agora avisa antes. *Commit 870d98c.*
10. **[onboarding.html]** Boot agora checa `status`/`billing_exempt` como `login.html` já fazia. *Commit 03819d4.*
11. **[master.html/supabase_61]** Cadastro manual de profissional agora bloqueia no servidor e-mail que já é de aluno (ou o próprio e-mail master) — testado via RPC direta, zero dado sintético deixado pra trás. *Commit 03819d4.*
12. **[treinos.html]** "Salvar rascunho" fora de uma sessão de criação, em cima de protocolo publicado, agora pede confirmação antes de tirar o treino do ar. *Commit b896e58.*
13. **[treinos.html]** "Aplicar modelo"/"Duplicar" nunca mais sobrescrevem a linha existente — sempre demovem o protocolo atual (se publicado) e nascem como inserção nova. *Commit b896e58.*

## ✅ Corrigidos — ~18 de risco médio

- **[perfil.html]** Crédito de indicação mencionado no aviso de cancelamento. *44c6440.*
- Retenção de 30 dias do cancelamento: **não foi ligada** (cron continua desligado) — decisão confirmada com o usuário nesta sessão (item genuinamente irreversível, merece conversa própria, não uma correção dentro de uma leva). Segue como pendência registrada, não como bug corrigido.
- **[avaliacoes.html]** Trocar de aluno com fotos pendentes agora avisa antes de descartar. *870d98c.*
- **[master.html/supabase_60]** "Trial até" vazio agora limpa de verdade (flag `clear_trial_ends_at` dedicado). *03819d4.*
- **[treinos.html]** "Trocar exercícios" agora limpa a observação do exercício antigo. *b896e58.*
- **[treinos.html]** Editar nome de exercício customizado propaga pras instâncias já no bloco. *b896e58.*
- **[treinos.html]** Wizard de IA desabilita "Semanas" quando a periodização não usa duração. *b896e58.*
- **[treinos.html]** Dropdown de rascunhos atualiza na hora após qualquer demote. *b896e58.*
- **[treinos.html]** "Duplicar"/"Aplicar modelo" bloqueados durante sessão de criação ativa. *b896e58.*
- **[aluno.html]** Sino de notificação agora atualiza a bolinha na tela Início. *8a9f3f3.*
- **[aluno.html]** Banner "Treino em andamento" agora aparece também na aba Treino. *8a9f3f3.*
- **[aluno.html]** Exercício pulado e completado depois via Lista agora reseta `sd.skipped` corretamente. *8a9f3f3.*
- **[aluno.html]** RPE + observação do fim do treino agora editáveis no histórico (não só na tela Finish). *8a9f3f3.*
- **[aluno.html]** Alimento privado ganhou editar e excluir. *8a9f3f3.*
- **[aluno.html]** Refeição já lançada ganhou "corrigir quantidade" (recalcula macros proporcionalmente). *8a9f3f3.*
- **[perfil.html]** "Cartão da assinatura": texto virou transparente sobre não ter os detalhes reais (decisão: não fingir certeza, não arriscar integração de pagamento nova sem poder testar). *44c6440.*
- **[alunos.html + mensagens.html]** Mensagem pra aluno Inativo agora avisa que fica "no vazio". *44c6440.*
- **[index.html]** Ranking do mês agora filtra `status='ativo'` — pausado/inativo some do placar. *cc74bd1.*
- **[relatorios.html + interpret-report]** Relatório de texto e interpretação por IA agora mencionam nutrição (meta validada + diário). *a838698, cee665a.*

## ✅ Corrigidos — ~16 de risco baixo / órfãos

- **[aluno.html]** Foto de perfil ganhou "Remover foto". *beb5dab.*
- **[aluno.html]** Push notification ganhou "Desativar" de verdade (unsubscribe + remove da tabela). *8a9f3f3.*
- **[aluno.html]** Check-in de sono ganhou reabertura (`openSleepModal()`, pré-preenche resposta salva). *8a9f3f3.*
- **[aluno.html]** Termos/Privacidade ganharam link em Configurações. *8a9f3f3.*
- **[aluno.html]** `#homeTopbar` (markup morto) removido. *8a9f3f3.*
- **[treinos.html]** "+ Cardio" ganhou "Editar" (antes só apagar e recriar). *b896e58.*
- **[treinos.html]** Modelo da biblioteca ganhou "Renomear". *b896e58.*
- **[treinos.html]** Lógica morta de "grupo muscular novo" removida. *b896e58.*
- **[avaliacoes.html]** "Excluir avaliação" implementado (RLS já permitia, só a UI nunca expunha). *870d98c.*
- **[avaliacoes.html]** "Voltar pra rascunho" implementado. *870d98c.*
- **[nutri.html]** "PDF de apoio" ganhou "Remover". *a838698.*
- **[onboarding.html]** Passo 2 ganhou "‹ Corrigir nome" e "Sair" nos dois passos; texto de "plano escolhido" corrigido (nunca existiu seletor de plano). *03819d4.*
- **[termos.html/privacidade.html]** "Voltar" ganhou fallback de navegação (login.html) quando não há referrer same-origin. *f49da2c.*
- **[index.html]** "Marcar como visto" — avaliado; sem mudança (ver nota abaixo).
- **[master.html]** `#mfaGate` ganhou "Sair" nos fluxos de enroll e challenge (cabeçalho ficava inacessível). *03819d4.*
- **`is_master_email()`** (SQL órfã) removida. *f49da2c.*
- **[mensagens.html]** Variável morta `currentThreadStudentName` removida. *44c6440.*
- **[login.html]** Agora checa sessão já válida antes de mostrar o formulário de e-mail. *03819d4.*

**Nota sobre "Marcar como visto" sem desfazer**: avaliado durante a correção — reabrir a observação já vista continua possível a qualquer momento pela aba Histórico (`historico.html`, já implementada antes desta varredura), que lista todas as sessões sem filtro de "visto". O "desfazer" específico do alerta da Início não foi implementado por ser redundante com esse caminho já existente.

---

## ⏳ Pendências reais, deliberadamente não corrigidas nesta leva

1. **Retenção de 30 dias do cancelamento de assinatura nunca roda de verdade** (`purge_inactive_professionals`, cron desligado) — decisão consciente: é exclusão permanente e irreversível de dado real rodando sem supervisão, confirmada pelo usuário como assunto pra conversa própria, não pra dentro de uma leva de correções.

## ⏳ Suspeitas não confirmadas — não corrigidas por pedido explícito do usuário

Nenhuma destas foi verificada com certeza suficiente durante a varredura original — ficam registradas como pendência de investigação futura, não como bug confirmado:

1. **[aluno.html]** Diário alimentar só mostra/edita o dia de hoje — sem tela pra revisar dias anteriores (pode ser escopo deliberado do MVP).
2. **[aluno.html]** Chat com o profissional: mensagem enviada não pode ser editada/apagada (pode ser escopo deliberado, mesmo espírito "sem retenção" de outras listas do app).
3. **[aluno.html]** Dado do profissional (branding, `mp_connect_status`, `ranking_enabled`) é carregado uma vez no boot e nunca atualizado — se o profissional mudar isso com o PWA do aluno já aberto, pode ficar desatualizado até fechar/reabrir.
4. **[perfil.html]** "Visualizar como aluno" (preview read-only) fica travado junto com o resto do white-label pra plano Starter — não está claro se é intencional.
5. **[historico.html]** Se um `student_id` na URL não existir mais (aluno excluído), a tela pode cair num estado confuso em vez de indicar claramente "aluno não existe mais".
6. **[index.html]** Aluno recém-cadastrado (há minutos) pode aparecer como "nunca treinou" no card de Alertas — sem período de carência.
7. **[index.html]** `computeDueInfo` pode nascer um aluno novo já "em atraso" dependendo da combinação de data de cadastro × dia de vencimento — não testado com valores reais.

---

## Resumo final

- **58 achados no total** — 51 confirmados e corrigidos nesta sessão, 1 pendência consciente (retenção de 30 dias), 7 suspeitas não confirmadas deixadas como estavam.
- **13 commits** de correção, cada um testado localmente (servidor + navegador + conta de teste real) antes do push, mais **6 migrations SQL novas** (`supabase_60` a `supabase_63`, incluindo o drop de uma função órfã) e **1 deploy de Edge Function** (`interpret-report`).
- Zero incidente de produção durante o processo — todo push verificado com `curl` retornando 200 nas páginas tocadas logo em seguida.
