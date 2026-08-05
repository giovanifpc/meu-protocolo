# Varredura de inconsistências de fluxo — 2026-08-05

Levantamento pedido pelo usuário depois de notar um padrão recorrente de retrabalho: funcionalidades novas sem lugar de chegada, botões de adição sem remoção, campos sem edição. A regra "análise de fluxo completo" (ver `CLAUDE.md`) só existe desde 2026-07-28 e nunca foi aplicada retroativamente ao que já estava pronto — este documento é essa aplicação retroativa, cobrindo o app inteiro (18 páginas HTML + as ~51 funções/RPC do banco).

**Método**: 6 auditorias paralelas (uma por região do app) mais uma varredura própria de funções SQL órfãs, cada uma checando 4 categorias:
1. **Ida sem volta** — ação de criar/conectar/ativar sem o par de remover/desconectar/desativar
2. **Campo sem edição** — dado capturado que só existe no momento de criar
3. **Função/recurso órfão** — botão, campo ou função que não vai a lugar nenhum
4. **Intersecção esquecida** — feature nova que não conhece feature relacionada já existente

**Nada foi corrigido ainda** — isto é só o levantamento, pra priorizarmos juntos. Achados marcados "suspeita, verificar" não foram confirmados com certeza total.

---

## 🔴 Prioridade alta — envolve dinheiro, dado de saúde, ou acesso trancado

### Cobrança automática

- **[perfil.html] Cancelar a assinatura do profissional não desconecta a cobrança automática dos alunos dele.** "Cancelar assinatura" (nível 2 — a própria assinatura SaaS) só chama `mercadopago-cancel-preapproval`. Nunca toca `mp_connect_status`/`professional_mp_connections` (nível 1 — a conta MP que o profissional conectou pra cobrar os PRÓPRIOS alunos) nem cancela nenhuma cobrança de aluno em andamento. Como `status='inativo'` bloqueia login imediatamente, o profissional fica **trancado do lado de fora** enquanto a cobrança automática dos alunos dele continua rodando sozinha, sem ninguém conseguir gerenciar ou cancelar. O texto de confirmação não avisa nada disso.
- **[alunos.html] Marcar "Inativo" só pra revelar o botão "Excluir" já cancela a cobrança automática de verdade, sem volta.** O bloco de exclusão só aparece quando o status vira Inativo — mas mudar pra Inativo já dispara `mercadopago-cancel-student-charge` na hora. Se o profissional volta o status pra Ativo (desistiu de excluir), o aluno segue "Ativo" mas a cobrança automática já foi cancelada de verdade — e nada reativa isso sozinho, só o próprio aluno reconfigurando o pagamento.
- **[alunos.html] `mp_charge_method` (cartão/Pix automático/nenhum) nunca aparece no painel do profissional.** Ele não tem como saber, olhando a lista de alunos, quem já está automatizado — o que abre espaço direto pro próximo item.
- **[alunos.html] "Marcar pago hoje" num aluno com Pix automático atrasa o próximo Pix gerado pelo cron em até 1 mês, sem aviso.** `computeNextDueDate()` usa `ultimo_pagamento_em` como base tanto pro lembrete por e-mail quanto pra decidir quando gerar o próximo Pix de verdade — um clique manual (comum, por hábito) empurra a cobrança real do sistema.
- **[index.html] Alerta de "mensalidade em atraso" não sabe se o aluno já está em cobrança automática.** Manda a mesma mensagem manual de WhatsApp pedindo confirmação de pagamento pra quem já está sendo cobrado automaticamente — dupla cobrança, dupla confusão.
- **[financeiro.html] Receita do mês contada em duplicidade.** "Recebido este mês" (a partir de `ultimo_pagamento_em`) e o bloco "Bruto/Taxa/Líquido" (a partir de `student_billing_charges`) somam a MESMA cobrança automática duas vezes, sem reconciliação — infla o número mostrado.
- **[alunos.html] Editar o dia de vencimento (`mensalidade_dia_vencimento`) de um aluno já com cartão automático não sincroniza com o Mercado Pago.** Só o valor (`mensalidade_valor`) é sincronizado — o dia real da cobrança continua o antigo, o app mostra um dia diferente do que realmente acontece.
- **[perfil.html] Crédito de indicação pendente (meses grátis) não é mencionado no fluxo de cancelamento** — não fica claro se é perdido ao cancelar antes de usar.
- **Retenção de 30 dias prometida no cancelamento nunca roda de verdade.** `purge_inactive_professionals()` existe mas o `cron.schedule` que a dispararia está **comentado/desligado** desde que foi criada (`supabase_17`) — decisão deliberada aguardando confirmação explícita, mas a tela de cancelamento promete "expira em 30 dias" e isso nunca se cumpre sozinho no banco.

### Dado de saúde / integridade de avaliação

- **[avaliacoes.html] Nova avaliação física sempre nasce com "Sexo: Feminino" fixo, ignorando `students.genero` já cadastrado.** As fórmulas de dobras cutâneas são sexo-específicas — esquecer de trocar manualmente corrompe o cálculo de %gordura em silêncio.
- **[avaliacoes.html] Editar uma avaliação que já compõe um comparativo publicado muda o que o aluno vê na hora, sem aviso ao profissional.** Comparativo é view computada ao vivo, não uma cópia — corrigir um peso digitado errado de 2 meses atrás altera retroativamente o "antes/depois" já compartilhado.
- **[avaliacoes.html] Trocar de aluno no meio de uma "Nova avaliação" descarta fotos já escolhidas (ainda não salvas) sem nenhum aviso.**

### Acesso e sessão

- **[onboarding.html] Boot não checa `status`/`billing_exempt` como `login.html` já checa.** Um profissional com assinatura cancelada mas sessão antiga ainda aberta pode contornar o bloqueio de reativação navegando direto pra `onboarding.html`; um profissional Founder isento (`billing_exempt`) que caia ali fora do fluxo normal vê a tela de cartão que deveria estar isento dela.
- **[master.html] Cadastro manual de profissional não checa se o e-mail já pertence a um aluno.** Reproduz exatamente a classe de bug "vazamento de sessão entre papéis" (aluno↔profissional) já corrigida em `index.html`/`onboarding.html`/`aluno.html` várias vezes — mas essa trava nunca chegou no painel master.

---

## 🟡 Categoria 1 — Ida sem volta (botão de adicionar sem remover)

- **[aluno.html]** Foto de perfil: só "Trocar foto", nunca "Remover foto" (volta ao círculo com inicial).
- **[aluno.html]** "Ativar notificações push": sem "Desativar" — só via configuração do navegador/OS.
- **[aluno.html]** Check-in de sono ("Agora não"/resposta errada): nenhum jeito de reabrir e corrigir no mesmo dia.
- **[aluno.html]** Termos/Privacidade só aparecem na tela de consentimento do 1º acesso — sem link em lugar nenhum depois pra reler.
- **[treinos.html]** "+ Cardio" adicionado: sem editar depois (só apagar e recriar do zero).
- **[treinos.html]** Modelo salvo na biblioteca: só "Aplicar"/"Excluir", sem renomear/atualizar.
- **[avaliacoes.html]** Nenhum botão "Excluir avaliação" (nem rascunho, nem finalizada) — RLS já permite, só a UI nunca expõe.
- **[avaliacoes.html]** Avaliação finalizada por engano não pode voltar a "rascunho" (fica visível ao aluno pra sempre).
- **[nutri.html]** "PDF de apoio": upload/substituir existem, "Remover" não (diferente da "Meta validada", que tem).
- **[onboarding.html]** Passo 1→2 (nome→cartão): nenhum "voltar"/corrigir nome/sair do fluxo.
- **[termos.html / privacidade.html]** Único link de navegação é `history.back()` — sem fallback pra home se a página foi aberta direto (link, busca, QR code).
- **[index.html]** "Marcar como visto" (observação do aluno): sem jeito de "marcar como não visto" de novo se for engano ou precisar reabrir acompanhamento.

## 🟡 Categoria 2 — Campo sem edição

- **[aluno.html]** Alimento privado criado pelo aluno (kcal/macros): sem editar nem excluir depois — erro de digitação fica pra sempre na busca dele.
- **[aluno.html]** RPE + observação do fim do treino: só editável enquanto a tela Finish daquela sessão está aberta — depois de sair, vira texto estático sem `onclick`.
- **[aluno.html]** Refeição já lançada no diário: só remover e relançar do zero, sem corrigir só a quantidade.
- **[master.html]** Campo "Trial até": apagar a data e salvar **não funciona** — `null` é silenciosamente ignorado pela RPC, a UI mostra vazio mas o banco mantém a data antiga (falha silenciosa).
- **[perfil.html]** "Cartão da assinatura" nunca mostra bandeira/4 dígitos/validade — profissional clica "Trocar cartão" sem saber qual cartão está ativo hoje.

## 🟡 Categoria 3 — Função/recurso órfão

- **`is_master_email()`** (SQL) — zero uso em lugar nenhum do projeto (já documentado no CLAUDE.md antes, segue sem uso).
- **[aluno.html:578]** `#homeTopbar` — markup morto (`display:none` fixo), substituído pela `.pro-topband` dinâmica, nunca removido.
- **[treinos.html]** Lógica defensiva pra "grupo muscular novo" em `customExerciseSaveBtn` — nunca pode disparar de verdade, já que o campo é um `<select>` fechado, não texto livre.
- **[mensagens.html]** `currentThreadStudentName` — variável atribuída e nunca lida (sem impacto, só código morto).

## 🟡 Categoria 4 — Intersecção esquecida (a categoria com mais achados)

- **[treinos.html] "Salvar rascunho" despublica silenciosamente um protocolo já ativo.** Fora de um fluxo de "criar novo" (ex: só abrindo o protocolo já publicado de um aluno e ajustando algo), clicar "Salvar rascunho" muda `status` pra `rascunho` na mesma hora, sem confirmação — o aluno perde acesso ao próprio treino instantaneamente até o profissional perceber e publicar de novo.
- **[treinos.html] "Aplicar modelo"/"Duplicar protocolo de outro aluno" sobrescrevem um protocolo já publicado sem rede de segurança**, diferente de "Criar novo" (que sempre demove pra rascunho antes). O aviso mostrado (`confirm()`) dá a entender que só edição não-salva está em risco — na prática, o protocolo publicado é perdido de vez.
- **[treinos.html] "Trocar exercícios" preserva a observação de execução do exercício ANTIGO**, mesmo o texto de ajuda prometendo que só sets/reps/descanso/técnica sobrevivem — a orientação de execução continua sendo mostrada ao aluno como se fosse do exercício novo.
- **[treinos.html] Editar nome de um exercício customizado não atualiza instâncias já colocadas num bloco de treino** — o nome antigo continua aparecendo até algo mais forçar um re-render completo.
- **[treinos.html] Wizard de IA não desabilita "Duração (semanas)" quando a periodização não usa duração** (o builder manual já faz isso) — valor digitado é silenciosamente ignorado sem sinal visual.
- **[treinos.html] Dropdown de rascunhos não atualiza depois que o protocolo atual vira rascunho** — só se atualiza na próxima ação.
- **[treinos.html] "Duplicar"/"Aplicar modelo" continuam clicáveis durante uma sessão de criação por IA/manual**, mutando silenciosamente o protocolo em branco sendo montado.
- **[aluno.html] Sino de notificação não atualiza a bolinha vermelha na tela Início** — `updateNotifBadge()` nunca é rechamada depois que `buildHomeDashboard()` recria o HTML, então a bolinha só aparece nas outras abas, nunca na Início (a tela que o aluno mais vê).
- **[aluno.html] Aba "Treino" nunca mostra o banner de "sessão em andamento"** — só aparece na Início; quem sai de um treino via botão físico de voltar e vai direto pra "Treino" não vê nem "Continuar" nem "Abandonar" ali.
- **[aluno.html] Exercício pulado (`skipped=true`) e depois completado de verdade via "Lista" nunca reseta a flag `skipped` no banco** — a UI mostra certo, mas o dado salvo em `training_history` fica inconsistente pra sempre.
- **[index.html] Ranking do mês não filtra por status do aluno** — aluno pausado/inativado no meio do mês continua pontuando e aparecendo no placar até o dia 1º seguinte.
- **[index.html/relatorios.html] Relatório de texto e interpretação por IA nunca mencionam nutrição** — nenhuma das duas tabelas do nutritracker (`nutrition_guidance`, `student_macro_goal`, `student_food_log`) é lida por nenhum dos dois relatórios, apesar do nutritracker já ser uma feature grande em produção.
- **[master.html] `#mfaGate` cobre a tela inteira, inclusive o cabeçalho** — enquanto o 2FA não está resolvido, "Sair" e "Novos códigos de recuperação" ficam inacessíveis; se o admin travar no meio do cadastro do autenticador, não tem "cancelar" dentro do próprio fluxo.
- **[alunos.html/mensagens.html] Mandar mensagem pra um aluno Inativo (bloqueado do próprio app) não avisa o profissional** que a mensagem fica "no vazio" até ele ser reativado.
- **[login.html] Não checa sessão já válida antes de mostrar o formulário de e-mail** (diferente de `onboarding.html`, que já faz isso) — quem já está logado e reabre o link de login precisa pedir OTP de novo à toa.

---

## Achados menores / suspeita, não confirmados com certeza total

- **[aluno.html]** Diário alimentar só mostra/edita o dia de hoje — sem tela pra revisar dias anteriores (pode ser escopo deliberado do MVP).
- **[aluno.html]** Chat com o profissional: mensagem enviada não pode ser editada/apagada (mesmo espírito "sem retenção" de outras listas do app, mas vale confirmar se é deliberado).
- **[aluno.html]** Dado do profissional (branding, `mp_connect_status`, `ranking_enabled`) é carregado uma vez no boot e nunca atualizado — se o profissional mudar isso com o PWA do aluno já aberto, fica desatualizado até fechar/reabrir.
- **[perfil.html]** "Visualizar como aluno" (preview read-only) fica travado junto com o resto do white-label pra plano Starter — não está claro se é intencional.
- **[historico.html]** Se um `student_id` na URL não existir mais (aluno excluído), a tela provavelmente cai num estado confuso em vez de indicar claramente "aluno não existe mais" — não confirmado com certeza.
- **[index.html]** Aluno recém-cadastrado (há minutos) já pode aparecer como "nunca treinou" no card de Alertas — sem período de carência.
- **[index.html]** `computeDueInfo` pode nascer um aluno novo já "em atraso" dependendo da combinação de data de cadastro × dia de vencimento — não testado com valores reais.

---

## Resumo por número

- **~50 achados confirmados** + ~7 "suspeita, verificar"
- Maior concentração: **Categoria 4 (intersecção esquecida)** — reforça o diagnóstico do usuário: as features individualmente funcionam, o problema é sempre na fronteira entre uma feature e outra (ex: cobrança automática × exclusão de aluno, avaliação × comparativo, protocolo × rascunho).
- Área de maior risco real (dinheiro se movendo sem controle, ou acesso trancado): **cobrança automática** (7 achados diferentes, todos cruzando `alunos.html`/`financeiro.html`/`perfil.html`/`index.html`) — candidata natural a ser a primeira rodada de correção.
