# Escopo fechado — leva de ajustes de uso real (2026-08-10)

Origem: 5 anotações do usuário testando o app de verdade nos dias 05/08 e 09/08. Documento de design, seguindo a mesma regra sempre usada no projeto: desenhar o escopo completo, mapear ida-e-volta e intersecção com o que já existe, e só depois implementar. **Zero código escrito ainda** — as 4 decisões de fork foram fechadas via `AskUserQuestion` (2026-08-10), os detalhes secundários de cada item foram resolvidos aqui com um default razoável, sinalizados como tal.

---

## 1. Changelog fixo no sino de notificações (ambos os lados)

**Pedido**: "quero que o banner de novas atualizações sempre fique salvo nas notificações do sino, sem mensagem de não lido, só a possibilidade de reabrir o banner a partir da notificação."

**Decisão fechada**: vale pros dois lados (profissional e aluno) — cada um com seu próprio changelog, já existente.

**Estado real hoje** (confirmado por leitura de código, não suposição):
- `whats-new.js`: um modal cheio (`render()`) aparece uma vez por versão nova (comparando `localStorage` contra `CHANGELOG.profissional.version`/`CHANGELOG.aluno.version`), fecha e nunca mais reaparece sozinho até a próxima versão subir.
- `notif-bell.js` (profissional): sino renderiza só `professional_notifications` vindo do banco — zero conceito de item estático.
- `aluno.html` (`renderNotifications()`, linha ~1806): mesma coisa, só `student_notifications` do banco.

**Desenho**:
- `whats-new.js` expõe duas funções globais no fim da IIFE: `window.__mpOpenWhatsNew()` (chama o `render()` já existente, direto, ignorando o estado de "já visto") e `window.__mpWhatsNewVersion()` (retorna a versão atual da superfície certa, pra usar no rótulo).
- `notif-bell.js` e `aluno.html`/`renderNotifications()`: a lista de notificações ganha um item FIXO no topo, sempre presente, nunca vindo do array de notificações do banco — algo como "🆕 Novidades desta atualização (vX.X.X)". Visual levemente distinto (não usa a classe `.unread`, nunca conta pro ponto vermelho do sino — `updateDot()`/`updateNotifBadge()` continuam olhando só pro array real, sem tocar nesse item).
- Clique chama `window.__mpOpenWhatsNew()`.
- Sem tabela nova, sem RPC nova — é 100% cliente, lendo do mesmo `CHANGELOG` hardcoded que já existe.

**Risco**: nenhum real. Ordem de carregamento de script não é problema (o clique só acontece bem depois do `defer` de `whats-new.js` já ter rodado).

---

## 2. Técnica de intensificação vs. contador de séries — só clareza de texto (Opção A)

**Pedido**: "o contador de séries e reps não se adequa quando existe técnica avançada, exemplo rest pause, assim o aluno fica confuso com a orientação do exercício sendo que a marcação de séries e reps não considera a técnica."

**Decisão fechada**: só ajuste de clareza/texto — zero mudança de schema ou de como a série é marcada.

**Estado real hoje**: `TECNICA_TIPS` (aluno.html, linha ~3833) já dá uma dica de como EXECUTAR a técnica, mas nunca conecta isso ao que "Série 1, Série 2, Série 3..." significa na tela de marcação — pra técnicas como Rest-Pause/Cluster/Myo-Reps/Drop-Set, uma "Série" da tela na verdade representa um CICLO INTEIRO da técnica (várias sub-tentativas), não uma série comum — e nada no rótulo genérico "Série N" avisa isso.

**Desenho** (zero schema novo, só front-end):
1. **`TECNICA_TIPS` reescrito** — cada entrada ganha uma frase extra amarrando explicitamente o texto ao que o aluno vê na lista de marcação. Ex:
   - Rest-Pause: "Ao chegar perto da falha, pause 10-15s e continue com a mesma carga. **Cada 'Série' da lista abaixo é 1 ciclo completo de rest-pause — marque só quando terminar todas as pausas daquele ciclo.**"
   - Drop-Set: "...**Cada 'Série' é 1 rodada completa com todos os drops — marque ao final da rodada.**"
   - Cluster: "...**Cada 'Série' é 1 cluster inteiro (todos os mini-blocos) — marque ao terminar o cluster.**"
   - Myo-Reps: mesma lógica (ativação + mini-séries = 1 "Série" da tela).
   - Pirâmide Crescente/Decrescente: já bate certo hoje (cada linha É um degrau real da pirâmide, com peso/reps próprios) — só reforça isso: "Cada 'Série' é um degrau — ajuste peso e reps a cada uma, seguindo a progressão."
   - Bi-Set/Tri-Set: não é sobre contagem de série do MESMO exercício, é sobre não descansar entre exercícios diferentes — tip ajustada pra deixar isso claro: "Depois de terminar a série daqui, vá direto pro próximo exercício sem descansar."
   - Super Slow/Negativo: são sobre execução (velocidade/fase do movimento), não mudam a contagem — tip mantida como está.
2. **Relabel contextual das linhas de série** — pras 4 técnicas "de ciclo" (Rest-Pause, Drop-Set, Cluster, Myo-Reps), o rótulo `Série N` na lista de marcação vira `Ciclo N` (`setsHtml`, linha ~3878-3886) — puramente de exibição, o dado por trás (`sd.sets[si]`) continua exatamente igual. Pras demais técnicas (ou sem técnica), continua "Série N" como sempre foi.

**Por que essa é a escolha certa pra agora**: resolve a confusão relatada sem inventar uma UI de sub-marcação por técnica (que exigiria decidir uma mecânica de dado diferente pra cada uma das 10 técnicas, schema novo, e mais uma superfície de bug) — se depois de usar isso na prática a confusão persistir, aí sim vale reabrir pra opção B (reestruturação de verdade).

---

## 3. Excluir treino realizado — só o aluno, qualquer sessão

**Pedido**: "deve ser possível excluir os treinos realizados caso tenha sido só teste ou incompleto."

**Decisão fechada**: só o aluno exclui a própria sessão (não o profissional, por ora).

**Estado real hoje**: `training_history` já tem RLS `"student manages own history" for all` (supabase_06_training.sql) — o aluno **já tem permissão de `delete` no banco hoje**, só falta o botão. Confirmado que apagar é seguro nas duas intersecções que existem com esse dado:
- Ranking (`get_student_ranking()`/`get_professional_student_ranking()`): recalculado ao vivo a cada chamada, sem cache — uma sessão apagada simplesmente para de contar, sem sobra.
- Alerta de "nova observação" do profissional (`index.html`, linha ~303): filtra direto em `training_history` (`observation_seen_at is null`) — sessão apagada some do alerta automaticamente, sem precisar de nenhuma limpeza extra.

**Desenho**:
- `buildHistList()` (aluno.html) — cada `.hist-item` ganha um ícone de lixeira (`ICONS.trash`, já existe no projeto — reaproveitado do botão de remover item do diário alimentar), com `confirm()` antes de apagar de verdade.
- **Escopo do que pode ser apagado — decisão de default, sem pergunta feita ao usuário**: qualquer sessão, completa ou incompleta — não trava só em "incompleta", mesmo padrão "sem retenção" já usado em outras listas do app (rascunho de treino, modelo da biblioteca). Diferença: se a sessão é **completa** (conta pra estatística/ranking), o texto do `confirm()` avisa isso explicitamente ("Essa sessão está completa e conta nas suas estatísticas — apagar não pode ser desfeito."); se é incompleta, confirmação mais simples.
- Depois de apagar: remove do array `history` em memória e re-renderiza a lista + qualquer card que dependa dele (grade "Hoje" da Início, gráfico de evolução de carga por exercício) — sem precisar recarregar a página inteira.
- **Fora de escopo desta leva**: profissional excluir sessão de um aluno pelo `historico.html` dele — fica registrado como possível extensão futura se aparecer necessidade real (a RPC precisaria ser nova, já que o profissional só tem `select` na tabela hoje).

---

## 4. Aviso claro no campo "Nome" (é o nome que o aluno vê)

**Pedido**: "o nome que eu cadastro é o mesmo que aparece pro aluno. Deve ter um aviso claro no campo de nome."

**Desenho** — mesmo padrão já usado em Nutri (legenda sempre visível, nunca escondida atrás do ícone de ajuda, ver "PDF de apoio" vs. "Meta validada"):
- `alunos.html`, campo "Nome" do cadastro (linha ~121): legenda abaixo do input — "Esse é o nome que aparece pro aluno dentro do próprio app dele."
- Mesma legenda no campo "Nome" da edição (novo, ver item 5 abaixo) — faz sentido nos dois lugares, já que a edição também mexe nesse mesmo dado.

Sem pergunta em aberto aqui — baixo risco, entra junto do item 5.

---

## 5. Editar nome e e-mail do aluno

**Pedido**: "a edição deve poder editar nome e email do aluno."

### Nome — baixo risco
Não é usado em nenhuma RLS (só `email` é) — vira só mais um campo (`data-role="edit-nome"`, pré-preenchido) dentro do payload que `saveStudentEdit()` já manda pra `students`, mesmo botão único "Salvar edição" que já existe.

### E-mail — o ponto mais delicado dos 5, decisão fechada: **troca com confirmação no e-mail novo**

**Por que é delicado**: confirmado por leitura de código que `students.email = auth.jwt() ->> 'email'` (supabase_02_students.sql) é o mecanismo que resolve "quem é o aluno logado" em praticamente toda RLS de tabela de aluno do projeto. Editar só `students.email` sem também trocar o e-mail em `auth.users` (Supabase Auth) trancaria o aluno pra fora do próprio app na hora — precisa necessariamente de uma Edge Function com Admin API trocando os dois de forma atômica (mesma classe de mecanismo já desenhado, mas nunca implementado, pro e-mail do master — ver "Escopo técnico se for implementado" na pendência de billing do dono da plataforma, `CLAUDE.md`).

**Desenho, fluxo completo**:

1. **`alunos.html`**: campo "E-mail" novo no painel de edição, pré-preenchido com `s.email` — mas separado do botão único "Salvar edição" (é uma mudança de classe de risco diferente de nome/WhatsApp/gênero/mensalidade). Botão próprio "Alterar e-mail" ao lado do campo, só habilitado quando o valor digitado é diferente do atual.
2. Clicar "Alterar e-mail" chama uma Edge Function nova, `request-student-email-change` — confere que quem chama é o profissional dono daquele aluno (mesmo padrão de JWT+RLS de sempre), gera um token de confirmação (tabela nova, `student_email_change_requests`: `student_id`, `new_email`, `token`, `expires_at` — expira em, por exemplo, 24h), e dispara um e-mail pro **endereço NOVO** via Resend (mesma infra já usada em `send-billing-email`) com um link `confirmar-email.html?token=...`.
3. **`students.email` NÃO muda ainda** nesse momento — o aluno continua logando normalmente com o e-mail antigo enquanto a confirmação não acontece. UI mostra um estado "E-mail pendente de confirmação: novo@x.com (aguardando o aluno confirmar)" com botão de reenviar ou cancelar a troca pendente.
4. **`confirmar-email.html`** (nova página, estática, sem exigir login — o aluno pode nem ter a sessão aberta nesse momento): lê o `token` da URL, chama uma segunda Edge Function (`confirm-student-email-change`) que valida o token (existe, não expirou, não foi usado), e só AÍ faz a troca atômica de verdade: `auth.admin.updateUserById(user_id, {email: novo})` (Admin API, service role) **e** `update students set email = novo where id = student_id`, nessa ordem — se o Admin API falhar, nada muda em `students`; se `students` falhar depois do Admin API ter sucedido, fica inconsistente por um instante, mas é o mesmo risco residual já aceito em outros fluxos do projeto que envolvem duas escritas coordenadas (ex: cancelamento de assinatura — sempre "externo primeiro, local depois", nunca o contrário).
5. Depois da troca bem-sucedida, `confirmar-email.html` mostra "E-mail confirmado — faça login com o novo endereço" e linka pra `login.html`. Uma sessão antiga do aluno (JWT ainda com o e-mail velho, em outra aba/dispositivo) para de bater com `students.email` a partir desse momento — comportamento esperado (o e-mail realmente mudou), não é um bug a "corrigir": o aluno só precisa logar de novo com o endereço novo, mesma mecânica de qualquer troca de e-mail de conta em qualquer app sério.
6. **Fora do escopo de ameaça**: nenhuma proteção extra contra o profissional digitando um e-mail que não é do próprio aluno — o profissional já é confiado dentro do próprio tenant (mesmo modelo de todo o resto do app, isolamento é ENTRE profissionais, não dentro de um). A confirmação no e-mail novo protege contra erro de digitação (motivo real do pedido), não contra profissional malicioso.

**Schema novo**: tabela `student_email_change_requests` (token hash — nunca texto puro, mesmo padrão de `master_recovery_codes` — student_id, new_email, expires_at, used_at). RLS: acesso só via as duas RPCs/Edge Functions `SECURITY DEFINER`/service role, zero policy direta (mesmo padrão de bloqueio total já usado em outras tabelas sensíveis do projeto).

**2 Edge Functions novas**: `request-student-email-change` (gera token, dispara e-mail), `confirm-student-email-change` (valida token, troca `auth.users` + `students.email` atomicamente, marca token usado).

---

## Resumo do que precisa de schema/deploy novo

| Item | Schema novo | Edge Function nova | Só front-end |
|---|---|---|---|
| 1. Changelog no sino | não | não | sim |
| 2. Técnica vs. série | não | não | sim |
| 3. Excluir sessão | não | não | sim |
| 4. Legenda do nome | não | não | sim |
| 5a. Editar nome | não | não | sim |
| 5b. Editar e-mail | sim (`student_email_change_requests`) | sim (2 novas) | não |

Itens 1-4 e 5a são baixo risco, sem dependência de deploy de Edge Function — podem ir pro ar assim que codados/testados. Item 5b (e-mail) é o único que depende de deploy de function antes de funcionar de ponta a ponta em produção (mesma limitação de rede de sempre pra sessão remota, a menos que a janela do Personal Access Token de hoje ainda esteja válida na hora de implementar).

**Nenhum código foi escrito ainda** — este documento fecha o desenho, aguardando confirmação do usuário pra começar a implementação.
