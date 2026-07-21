# Roadmap Estratégico Pós-Desenvolvimento — Meu Protocolo

> **Status: salvo em 2026-07-19, execução ainda não iniciada.** Este documento é um plano de execução operacional — diz o que fazer em cada fase e, principalmente, **o que não fazer**. Regra central: não desenvolver porque parece boa ideia — desenvolver porque vários clientes reais demonstraram a mesma necessidade (nunca com base na opinião de um único usuário).
>
> **Esclarecido pelo usuário no mesmo dia: o MVP ainda não está fechado, o desenvolvimento normal continua.** Este roadmap só entra em vigor (Fase 1 — congelamento) depois que o usuário confirmar explicitamente que o dev terminou. Não tratar "documento salvo" como "já podemos parar de construir". Ver `CLAUDE.md`, seção "Status atual", pro estado mais recente do que ainda falta implementar.

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

**Cliente 0 registrada (2026-07-21): `Jujuelilicaanimacoes@hotmail.com`** — e-mail guardado aqui só de referência pra quando essa fase for iniciada de verdade; nenhuma conta foi criada ainda, execução desta fase segue não iniciada (ver nota no topo do documento).

---

## FASE 3 — Ajustes rápidos

Corrigir apenas os problemas encontrados pelo Cliente 0. Não adicionar recursos novos. Objetivo: eliminar atritos.

---

## FASE 4 — Programa Founder

**Objetivo**: criar um pequeno grupo de clientes fundadores. Quantidade ideal: 5 a 10 profissionais.

Como fazer:
- **Não alterar o código atual.** O fluxo de pagamento já está pronto e não deve ser modificado por causa dos primeiros clientes.
- Em vez disso: criar manualmente as contas Founder pelo painel administrativo (`master.html`), liberar acesso Premium, **não exigir cadastro de cartão neste momento**.
- Anotar a data de ativação de cada Founder.
- **Ajuste do usuário em relação ao plano original**: em vez de um prazo fixo de 14 dias sem cartão, usar a regra "até a entrevista de validação" — na prática 12, 15 ou 20 dias, dependendo da disponibilidade da pessoa. Só pedir o cartão depois de ter certeza de que ela percebeu valor no produto.
- Se demonstrar interesse em continuar, aí sim solicitar o cadastro do cartão e ativar oficialmente a assinatura Founder de **R$50/mês vitalício** (enquanto mantiver a assinatura ativa).

Isso evita retrabalho no código, mantém o fluxo principal intacto, e reduz atrito pra quem está ajudando a validar o produto.

**Nota técnica (2026-07-19)**: essa fase já é executável com o código atual, sem nenhuma mudança — `master.html` já permite editar `plano` e `valor_customizado` por profissional (`master_update_professional`), exatamente o mecanismo descrito aqui.

Benefícios Founder: plano Premium completo, valor vitalício de R$50/mês enquanto mantiver a assinatura ativa, participação na construção do sistema, canal direto para sugestões, acesso antecipado às novidades. **O programa Founder não é um desconto — é uma recompensa por participar da construção inicial do produto.**

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

---

## Evolução do Assistente Inteligente

Nesta primeira fase ele funciona só por regras (ver `assistant-hints.js`/`supabase_21_assistant_hints.sql`, implementado em 2026-07-19). Registrar internamente: sugestões exibidas, ignoradas, utilizadas (já é o que `assistant_hint_events` grava). **Não implementar aprendizado adaptativo agora** — só quando houver quantidade suficiente de usuários e dados que justifiquem esse investimento.

---

## Filosofia de desenvolvimento

Durante toda a validação, seguir uma regra simples: **não desenvolver porque parece uma boa ideia — desenvolver porque vários clientes demonstraram a mesma necessidade.**

O objetivo desta etapa não é criar o software mais completo do mercado. É criar o software que um personal abre pela primeira vez, entende em poucos minutos e passa a considerar indispensável pra sua rotina profissional.
