# Roadmap Estratégico Pós-Desenvolvimento — Meu Protocolo

> **Status: salvo em 2026-07-19, execução ainda não iniciada.** Este documento é um plano de execução operacional — diz o que fazer em cada fase e, principalmente, **o que não fazer**. Regra central: não desenvolver porque parece boa ideia — desenvolver porque vários clientes reais demonstraram a mesma necessidade (nunca com base na opinião de um único usuário).
>
> **Esclarecido pelo usuário no mesmo dia: o MVP ainda não está fechado, o desenvolvimento normal continua.** Este roadmap só entra em vigor (Fase 1 — congelamento) depois que o usuário confirmar explicitamente que o dev terminou. Não tratar "documento salvo" como "já podemos parar de construir". Ver `CLAUDE.md`, seção "Status atual", pro estado mais recente do que ainda falta implementar.
>
> **Atualização de status (2026-07-23): na prática, as Fases 2/3 já começaram.** A Cliente 0 (`Jujuelilicaanimacoes@hotmail.com`) já está cadastrada de verdade (não pagante, em trial) e já mandou feedback real, já aplicado em 2 commits (ver `CLAUDE.md`, seção "Feedback real da Cliente 0 aplicado"). O texto acima ("execução ainda não iniciada") ficou parcialmente desatualizado — mantido por ora como registro histórico de quando o documento foi criado, mas não leia como "nada começou ainda".
>
> **Fusão de roadmap (2026-07-23):** o usuário trouxe um segundo roadmap — um plano de crescimento mês a mês (metas de assinantes/receita, Mês 1 ao Mês 12, mais visão de longo prazo pós-ano-1 e objetivo de 3 anos). Ele foi **fundido** neste documento, não substitui as Fases abaixo. Onde os dois falavam da mesma coisa, o conteúdo novo virou detalhe/reforço da Fase já existente; onde era assunto novo (internacionalização, visão de longo prazo, metas de receita por mês), virou Fase nova (12 e a seção final "Visão de longo prazo"). **A regra de ouro das Fases 1-10 continua valendo por cima de qualquer meta de calendário**: nenhuma meta de "X assinantes até o mês Y" justifica pular uma fase de validação ou construir feature sem 3+ relatos — se o negócio estiver mais lento que o calendário do roadmap de crescimento, o calendário cede, não o processo.

---

## Missão desta fase

O desenvolvimento do MVP será considerado concluído quando todas as funcionalidades planejadas estiverem funcionando de forma estável. A partir desse momento, a prioridade deixa de ser desenvolver novas funções e passa a ser **validar o produto com usuários reais**. Durante esse período, qualquer nova funcionalidade somente deverá ser criada se surgir repetidamente através do uso dos clientes. O foco passa a ser aprender.

---

## FASE 1 — Congelar o desenvolvimento

**Objetivo**: evitar entrar no ciclo infinito de desenvolvimento.

O que fazer:
- Corrigir apenas bugs.
- Corrigir problemas de usabilidade.
- Ajustar pequenos detalhes de UX.
- **Não criar novas funcionalidades.**

Toda nova ideia deve entrar numa lista de backlog pra ser avaliada futuramente. Nenhuma ideia é implementada só porque parece interessante.

---

## FASE 2 — Cliente 0

**Objetivo**: validar se o software realmente resolve o problema de um profissional.

O que fazer: cadastrar apenas um cliente, acompanhar de perto a utilização, observar sem interferir. Registrar:
- onde travou;
- onde ficou confuso;
- quais telas nunca abriu;
- quais recursos mais utilizou;
- quanto tempo levou pra: cadastrar o primeiro aluno / criar o primeiro treino / finalizar o fluxo completo.

Ao final de alguns dias, conversa com estas perguntas:
- O que mais facilitou seu trabalho?
- O que mais atrapalhou?
- O que faria você cancelar?
- O que ainda faz fora do sistema?
- Se amanhã o Meu Protocolo deixasse de existir, quanto isso impactaria seu trabalho? (nota de 1 a 10)

**Não perguntar apenas se gostou.**

**Cliente 0 registrada (2026-07-21): `Jujuelilicaanimacoes@hotmail.com`** — **atualização 2026-07-23: a conta já foi criada de verdade** (não pagante, em trial, cadastrada pelo Giovani via `master.html`) e já está em uso real, com feedback já recebido e aplicado em pelo menos 2 correções (ver `CLAUDE.md`, seção "Feedback real da Cliente 0 aplicado"). Esta fase está, na prática, em andamento — falta ainda a conversa estruturada de fim de fase (as 5 perguntas acima).

---

## FASE 3 — Ajustes rápidos

Corrigir apenas os problemas encontrados pelo Cliente 0. Não adicionar recursos novos. Objetivo: eliminar atritos.

---

## FASE 4 — Programa Founder

**Objetivo**: criar um pequeno grupo de clientes fundadores. Quantidade ideal: 5 a 10 profissionais.

**Decisão real do usuário (2026-07-23): o grupo Founder vai ser de só 4 pessoas**, menor do que a faixa ideal acima — e a intenção já declarada é migrar pra divulgação orgânica e venda a valor cheio logo depois que esses 4 validarem, sem esperar chegar a 5-10. Não é um desvio problemático do plano, é só o número real com o qual a Fase 4 vai rodar desta vez.

Como fazer:
- **Não alterar o código atual.** O fluxo de pagamento já está pronto e não deve ser modificado por causa dos primeiros clientes.
- Em vez disso: criar manualmente as contas Founder pelo painel administrativo (`master.html`), liberar acesso Premium, **não exigir cadastro de cartão neste momento**.
- Anotar a data de ativação de cada Founder.
- **Ajuste do usuário em relação ao plano original**: em vez de um prazo fixo de 14 dias sem cartão, usar a regra "até a entrevista de validação" — na prática 12, 15 ou 20 dias, dependendo da disponibilidade da pessoa. Só pedir o cartão depois de ter certeza de que ela percebeu valor no produto.
- Se demonstrar interesse em continuar, aí sim solicitar o cadastro do cartão e ativar oficialmente a assinatura Founder de **R$50/mês vitalício** (enquanto mantiver a assinatura ativa).

Isso evita retrabalho no código, mantém o fluxo principal intacto, e reduz atrito pra quem está ajudando a validar o produto.

**Nota técnica (2026-07-19)**: essa fase já é executável com o código atual, sem nenhuma mudança — `master.html` já permite editar `plano` e `valor_customizado` por profissional (`master_update_professional`), exatamente o mecanismo descrito aqui.

Benefícios Founder: plano Premium completo, valor vitalício de R$50/mês enquanto mantiver a assinatura ativa, participação na construção do sistema, canal direto para sugestões, acesso antecipado às novidades. **O programa Founder não é um desconto — é uma recompensa por participar da construção inicial do produto.**

**⚠️ Pendência técnica registrada em 2026-07-22, antes de confiar 100% no billing de qualquer Founder que vier a pagar de verdade**: duas chamadas reais à API do Mercado Pago nunca foram executadas nem uma vez contra o ambiente real (nem em sandbox, nem em produção) — `PUT /preapproval/{id}` (sincroniza o valor cobrado quando o profissional troca de plano pelo `perfil.html`, `mercadopago-update-preapproval`) e `POST /v1/payments/{id}/refunds` (estorno automático do mês grátis do programa de indicação, dentro de `mercadopago-webhook`). Toda a lógica de negócio em volta delas (barreira de limite de aluno no downgrade, resolução de indicação, crédito/consumo de mês grátis) já foi validada de verdade contra o banco — só a integração com a API externa em si segue sem execução real. Risco prático: zero enquanto ninguém tiver assinatura paga de verdade (nenhum profissional tem `mp_preapproval_id`, incluindo Cliente 0 via `billing_exempt`). **Validar antes de**: o primeiro Founder que trocar de plano pelo próprio painel, ou o primeiro crédito de indicação precisar ser aplicado de verdade numa cobrança real. Ver seção "Pendências do celular aplicadas no PC (2026-07-22)" no topo do `CLAUDE.md` pro detalhamento completo do que já foi testado com segurança (RPCs/SQL) vs. o que falta.

**Do roadmap de crescimento fundido (2026-07-23) — cadência a manter durante todo o período Founder, não só no fim:**
- **Feedback semanal, não só a entrevista formal da Fase 5**: pedir um retorno rápido (mensagem, ligação curta) toda semana com cada Founder ativo, além da conversa estruturada que vem só depois de 2-3 semanas. Detecta atrito cedo, sem esperar o ciclo de entrevista completo — mas não substitui a Fase 5, só antecipa sinais.
- **Gravar vídeos curtos demonstrando o app** (cadastrar aluno, montar treino, ver progresso) durante esse período — serve de material de onboarding pros próprios Founders agora, e vira semente de conteúdo de marketing pra Fase 10/11 depois (ver "Construção da comunicação").
- **Programa de indicação já está implementado tecnicamente** (item 16 do roadmap de dev, `CLAUDE.md`) — "implementar" aqui já não é tarefa de código, é só usar/divulgar o link entre os próprios Founders. Lembrar da pendência técnica do parágrafo acima (estorno real via Mercado Pago) antes de confiar que o crédito é aplicado de verdade numa cobrança.

---

## FASE 5 — Entrevistas

Após duas ou três semanas, conversar individualmente com todos os Founders. Registrar tudo. Perguntas:
- O que fez você continuar usando?
- Qual recurso mais utiliza?
- Qual nunca abriu?
- O que mais economiza seu tempo?
- O que falta?
- Você indicaria o Meu Protocolo? Por quê?

---

## FASE 6 — Encontrar padrões

Comparar todas as entrevistas. **Sempre que três ou mais clientes relatarem o mesmo problema, esse problema entra como prioridade máxima.** Nunca desenvolver baseado apenas na opinião de um único usuário.

---

## FASE 7 — Melhorias

Só agora iniciar pequenas evoluções. Prioridade:
1. Bugs
2. UX
3. Onboarding
4. Assistente Inteligente
5. Automações

Novas funcionalidades somente se vários clientes pedirem.

---

## FASE 8 — Validar retenção

Antes de pensar em marketing, responder: os clientes continuam usando? Entram diariamente? Montam todos os treinos pelo sistema? Sentem falta quando ficam sem acesso?

**Enquanto essa resposta não for claramente "sim", ainda não é hora de escalar.**

**Do roadmap de crescimento fundido (2026-07-23) — ações concretas pra sustentar essa fase, não só medir:**
- **Acompanhar cancelamentos de perto**: todo cancelamento merece entender o motivo (mesmo que informal, não precisa de pesquisa formal) — é o mesmo espírito da Fase 6 (padrão em 3+ relatos), aplicado ao sinal mais caro que existe (cliente saindo).
- **Automatizar suporte**: o chatbot de suporte via IA (`support-chat`, já implementado e testado — ver `CLAUDE.md`) é a base disso. Nesta fase, o foco é reduzir escalonamento manual pro Giovani, não construir feature nova.
- **Central de ajuda**: um lugar único (FAQ/artigos) pras perguntas mais repetidas do chatbot de suporte — só vale a pena depois que `support_messages` (log do master) mostrar quais perguntas se repetem; não adiantar conteúdo antes de ter esse dado real.

---

## FASE 9 — Prospecção

Começar manualmente. Sem anúncios, sem tráfego pago, sem campanhas. Primeiros locais: academia onde faz estágio, profissionais conhecidos, indicações, networking.

A abordagem deve ser prática — não apresentar slides, não explicar todas as funcionalidades. Apenas pedir: **"Vamos cadastrar um aluno e montar um treino."** Se o profissional perceber valor em poucos minutos, o resto será descoberto naturalmente.

---

## FASE 10 — Construção da comunicação

Durante todas as entrevistas, registrar frases reais dos usuários (ex: "Economizei muito tempo", "Agora está tudo organizado", "Não preciso mais procurar conversa no WhatsApp"). Essas frases serão usadas futuramente na Landing Page. **Jamais inventar argumentos de venda — usar sempre a linguagem dos próprios clientes.**

---

## FASE 11 — Escala

Só quando houver aproximadamente: 10 clientes ativos, retenção consistente, feedback positivo recorrente, baixo índice de cancelamento.

Iniciar: Landing Page definitiva, trial padrão de 14 dias, cadastro obrigatório do cartão, produção de conteúdo, SEO, Instagram, parcerias, programa de indicação, tráfego pago (quando houver orçamento).

Neste momento o fluxo padrão do sistema passa a ser: **Cadastro → Cartão → 14 dias → Cobrança automática.** Os clientes Founder permanecem no plano vitalício de R$50/mês, enquanto mantiverem a assinatura ativa.

### Detalhamento mês a mês (do roadmap de crescimento fundido, 2026-07-23)

O bloco acima (Landing Page, conteúdo, SEO etc.) é o "o quê"; esta subseção é o "em que ordem/ritmo", com metas de assinantes só como referência de ritmo — **não são gatilho pra pular fase nenhuma das Fases 1-10 nem pra construir feature sem 3+ relatos** (ver nota no topo do documento). Se o Cliente 0/Founders ainda não confirmaram retenção (Fase 8), não faz sentido acelerar pra essas metas.

- **Autoridade (conteúdo)**: publicar conteúdo com regularidade (ideal: diário, mas sustentável > frequente), sempre mostrando funcionalidade real do app (não conceito) — reaproveita os vídeos de demonstração já gravados na Fase 4 e as frases reais dos clientes já coletadas na Fase 10. Publicar depoimentos reais dos Founders (com autorização deles).
- **Landing page profissional**: versão definitiva, escrita com a linguagem real dos clientes (Fase 10), não copy inventado. **Nota (2026-07-23)**: uma versão bem mais enxuta (`landing.html`) já foi criada antes desta fase — não é a definitiva, é só um portão de entrada decente pra substituir o link cru de `login.html` mandado por WhatsApp durante o período Founder (4 pessoas, plano reduzido do que este documento previa). Sem depoimento nem preço — essa parte espera a validação de verdade.
- **Automatizar onboarding**: reduzir o quanto o Giovani precisa fazer manualmente pra um profissional novo começar a usar — o `master.html` hoje cadastra manualmente (bom pro estágio Founder, baixo volume); automatizar aqui significa o cadastro self-service (`onboarding.html`, já existe) virar o caminho padrão outra vez, sem precisar do master pré-provisionar cada conta.
- **Escala orgânica**: melhorar o sistema de indicação com base no uso real (não adivinhar o que falta), lançar pequenas atualizações continuamente (mesmo espírito da Fase 7, só que agora com base em atrito real de uma base maior), criar uma comunidade (WhatsApp ou Telegram) pros profissionais trocarem experiência entre si, buscar parcerias com criadores de conteúdo pequenos/nichados (não precisa ser influenciador grande) que já falam pro público de personal trainers.
- **Consolidação**: uma vez que a base cresce, redobrar a atenção da Fase 8 (retenção) — é fácil perder o controle de cancelamento quando o número de clientes sobe rápido.
- **Marco de transição pra internacionalização (Fase 12)**: quando o crescimento doméstico estabilizar (retenção validada, cancelamento baixo, base de clientes pagantes recorrente) — **parar de adicionar funcionalidade nova e focar só em crescimento** é a mesma regra da Fase 1, reaplicada aqui: a essa altura o produto já deve estar maduro o bastante pra não precisar de feature nova pra crescer, só de mais gente conhecendo. Esse é o sinal de que faz sentido olhar pra Fase 12.

---

## FASE 12 — Internacionalização (do roadmap de crescimento fundido, 2026-07-23)

**Pré-requisito**: só entrar aqui depois que a Fase 11 mostrar crescimento doméstico estável (ver "Marco de transição" no fim da Fase 11) — internacionalizar um produto que ainda não reteve bem no Brasil só multiplica o mesmo problema em mais idiomas.

**Preparação técnica**:
- Traduzir a interface pra inglês e espanhol.
- Integrar Stripe (Mercado Pago não cobre bem cartão internacional/moeda estrangeira — é a lacuna real que motiva um segundo processador).
- Ajustar exibição de moeda por região.
- Criar uma landing page internacional (conteúdo e prova social separados da landing brasileira — não é tradução literal, é outro público).

**Ida ao mercado, em ordem**:
1. Brasileiros no exterior primeiro (EUA, Portugal, Irlanda, Reino Unido, Canadá) — usar vídeos em português mostrando que o app funciona em qualquer país, já que o público inicial fala português mesmo morando fora. Meta de referência: ~15 clientes internacionais nesse primeiro passo.
2. Conteúdo específico pra brasileiros que trabalham como personal trainer fora do Brasil (dor específica: como validar formação/atender aluno à distância/etc.) — meta de referência: ~30 clientes internacionais.
3. Só depois, investir em SEO, blog e canal no YouTube (produção de conteúdo em inglês/espanhol) + automação de e-mail marketing — meta de referência: ~40 clientes internacionais.
4. Expandir tráfego pago internacional, melhorar onboarding com o aprendizado acumulado, criar plano anual (reduz cancelamento por reduzir a frequência de decisão de continuar) — meta de referência: ~50 clientes internacionais.
5. Nessa altura, focar só em retenção — cliente satisfeito indica cliente, mesmo princípio da Fase 8/10, agora pro público internacional.

**Marco de referência (não meta rígida)**: receita recorrente combinada (Brasil + exterior) na casa de R$20 mil/mês ao fim de ~1 ano de execução da Fase 11+12. É um número de calibração, não um prazo — se demorar mais porque a retenção pede mais cuidado, a retenção vence.

---

## Visão de longo prazo (pós ano 1) — do roadmap de crescimento fundido, 2026-07-23

Depois que Brasil (Fase 11) e exterior (Fase 12) estiverem gerando receita recorrente estável, a ordem sugerida é:

1. Contratar suporte (humano, pra complementar o chatbot de IA nos casos que ele já escala hoje).
2. Contratar atendimento.
3. Automatizar marketing.
4. Reduzir a atuação operacional do Giovani no dia a dia do Meu Protocolo.
5. Levar o app pra personal trainers de qualquer nacionalidade (não só brasileiros/brasileiros no exterior) — passo natural depois que a base em inglês/espanhol já validou o produto fora do público de origem.
6. **Só depois de tudo isso**, considerar um segundo SaaS — nunca antes, pra não repetir o erro de dividir atenção entre dois produtos não validados ao mesmo tempo.

**Objetivo de referência pra 3 anos** (norte, não prazo comprometido): três produtos SaaS operando — o Meu Protocolo (~R$40 mil/mês), um segundo SaaS (~R$20 mil/mês) e um terceiro (~R$20 mil/mês) — receita recorrente combinada na casa de R$80 mil/mês, com operação cada vez mais automatizada e menos dependente do trabalho diário do Giovani. **O fator que decide se esse cenário acontece de verdade não é o calendário — é retenção de cliente sustentada e aquisição constante de gente nova**, exatamente o que as Fases 1-11 acima existem pra garantir antes de qualquer expansão.

---

## Evolução do Assistente Inteligente

Nesta primeira fase ele funciona só por regras (ver `assistant-hints.js`/`supabase_21_assistant_hints.sql`, implementado em 2026-07-19). Registrar internamente: sugestões exibidas, ignoradas, utilizadas (já é o que `assistant_hint_events` grava). **Não implementar aprendizado adaptativo agora** — só quando houver quantidade suficiente de usuários e dados que justifiquem esse investimento.

---

## Filosofia de desenvolvimento

Durante toda a validação, seguir uma regra simples: **não desenvolver porque parece uma boa ideia — desenvolver porque vários clientes demonstraram a mesma necessidade.**

O objetivo desta etapa não é criar o software mais completo do mercado. É criar o software que um personal abre pela primeira vez, entende em poucos minutos e passa a considerar indispensável pra sua rotina profissional.
