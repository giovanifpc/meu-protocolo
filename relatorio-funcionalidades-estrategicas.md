# Relatório de Funcionalidades Estratégicas
## Meu Protocolo
### Foco: Retenção, Crescimento do Profissional e Diferenciação Competitiva

> **Status: escopo recebido, NADA implementado ainda** (registrado em 2026-07-31). Documento preservado como veio do usuário — ver a entrada correspondente em `CLAUDE.md` (seção "Status atual") pra como cada item se relaciona com features já existentes ou já pendentes, e pra observações antes de qualquer implementação.
>
> **Atualização 2026-08-01**: item 1 (Programa de Indicação do Profissional pros próprios alunos) fica deliberadamente em aberto por hora — o usuário pediu pra priorizar antes dele um item novo, ainda sem desenho: uma forma do profissional premiar o aluno diretamente (ex. mensalidade grátis), motivada pelo Fundador 1 (Otávio) ter pedido o acompanhamento do ranking justamente pra poder premiar os primeiros colocados. Precisa desenhar como o profissional vai **gerir** essas premiações antes de implementar qualquer coisa. Ver entrada "⏳ Pendência refinada..." no topo de `CLAUDE.md`.

---

# Objetivo

Este documento reúne funcionalidades voltadas exclusivamente para aumentar o valor percebido pelo profissional, reduzir cancelamentos e posicionar o Meu Protocolo como a principal plataforma de gestão para consultorias fitness.

O objetivo não é transformar o sistema em um CRM de marketing, mas criar ferramentas que ajudem o profissional a crescer, organizar sua consultoria e tomar melhores decisões.

---

# 1. Programa de Indicação do Profissional

## Objetivo

Transformar os próprios alunos em divulgadores da consultoria.

## Funcionamento

O profissional poderá criar campanhas simples de indicação.

Exemplos:

- Indique um amigo e ganhe uma semana de acompanhamento.
- Indique um amigo e ganhe uma avaliação física.
- Indique um amigo e participe de um desafio ou sorteio.

O sistema gera automaticamente um link exclusivo.

Sempre que um novo aluno se cadastrar utilizando esse link, a indicação será registrada.

## Funcionalidades

- Geração automática de links.
- Histórico de indicações.
- Contador de conversões.
- Controle das recompensas.
- Estatísticas de desempenho da campanha.

## Benefícios

### Para o profissional

- Crescimento orgânico da consultoria.
- Maior aquisição de alunos sem investimento em anúncios.
- Ferramenta simples e totalmente integrada ao aplicativo.

### Para o Meu Protocolo

- Maior percepção de valor.
- Associação direta entre o crescimento do profissional e o uso da plataforma.

---

# 2. Sistema de Reativação de Ex-Alunos

## Objetivo

Facilitar a recuperação de alunos que já passaram pela consultoria.

## Funcionamento

Após o encerramento do acompanhamento, o aluno permanece registrado.

O sistema poderá identificar automaticamente oportunidades de reativação após períodos configuráveis.

Exemplo:

30 dias

90 dias

180 dias

365 dias

Ao identificar um possível retorno, o aplicativo exibe um aviso.

Exemplo:

"João está há seis meses sem acompanhamento. Deseja entrar em contato?"

Ao clicar no aviso, o profissional poderá enviar uma mensagem pronta (editável) utilizando:

- Chat interno.
- Notificação Push.
- Futuramente outros canais compatíveis.

## Dashboard

Exibir:

- Ex-alunos.
- Tempo de inatividade.
- Última conversa.
- Data do último protocolo.
- Motivo do encerramento (quando informado).

## Benefícios

- Recuperação de receita.
- Reaproveitamento da carteira de clientes.
- Aumento do retorno financeiro percebido pelo profissional.

---

# 3. Lista de Interessados

## Objetivo

Organizar pessoas que demonstraram interesse, mas ainda não iniciaram a consultoria.

## Funcionamento

Novo menu:

Interessados

Cadastro simples contendo:

- Nome.
- Telefone.
- Objetivo.
- Origem do contato.
- Data.
- Observações.

## Status

- Novo.
- Conversando.
- Avaliação agendada.
- Aguardando resposta.
- Convertido.
- Perdido.

## Recursos

- Lembretes automáticos.

Exemplo:

"Você não conversa com Maria há 12 dias."

- Mensagens rápidas.
- Conversão em aluno ativo com apenas um clique.

## Benefícios

Permite acompanhar potenciais alunos sem transformar o aplicativo em um CRM completo.

Mantém o foco exclusivamente na rotina do profissional de Educação Física.

---

# 4. Newsletter de Inteligência Coletiva

## Objetivo

Transformar os dados anônimos da plataforma em conhecimento útil para todos os profissionais.

Não se trata de uma comunidade.

Não haverá interação entre usuários.

Todo o conteúdo será gerado a partir de dados estatísticos totalmente anonimizados.

## Frequência

Semanal ou mensal.

## Exemplos

"Os protocolos Upper/Lower apresentaram maior taxa de adesão neste mês."

"Treinos entre 45 e 60 minutos tiveram maior taxa de conclusão."

"Alunos que registram hidratação diariamente treinam, em média, mais vezes por semana."

"Os exercícios mais utilizados para hipertrofia de quadríceps."

"Tendências observadas na plataforma durante o mês."

## Benefícios

- Atualização constante do profissional.
- Sensação de evolução contínua.
- Conteúdo exclusivo impossível de ser encontrado em outras plataformas.
- Diferencial competitivo que aumenta de valor conforme cresce a base de usuários.

---

# 5. Benchmark da Consultoria (Implementação Futura)

## Observação

Esta funcionalidade deverá ser desenvolvida apenas quando a plataforma possuir uma base significativa de profissionais ativos (centenas de usuários), garantindo comparações estatisticamente relevantes.

## Objetivo

Permitir que o profissional compare os indicadores da sua consultoria com a média da plataforma de forma totalmente anônima.

## Indicadores sugeridos

- Taxa média de adesão dos alunos.
- Frequência semanal de treinos.
- Tempo médio de permanência dos alunos.
- Crescimento mensal da carteira.
- Percentual de alunos ativos.
- Percentual de alunos em risco.
- Taxa de reativação de ex-alunos.
- Tempo médio de resposta do profissional.

## Exemplo de apresentação

Sua consultoria

- Adesão: 91%

Média da plataforma

- Adesão: 84%

Resultado

Você está entre os 15% profissionais com maior adesão.

Outro exemplo

Sua retenção caiu 4% neste mês.

A média da plataforma permaneceu estável.

Deseja visualizar possíveis causas?

## Benefícios

- Incentiva melhoria contínua.
- Gera valor utilizando exclusivamente dados da própria plataforma.
- Cria um diferencial extremamente difícil de copiar por concorrentes com menor base de usuários.
- Fortalece o posicionamento do Meu Protocolo como plataforma inteligente de gestão.

---

# Impacto Estratégico

As funcionalidades propostas compartilham o mesmo princípio:

- Ajudam o profissional a crescer.
- Melhoram a organização da consultoria.
- Aumentam o retorno financeiro percebido.
- Elevam o custo de substituição da plataforma.
- Reforçam a proposta do Meu Protocolo como o sistema operacional da consultoria fitness.

Diferentemente de funcionalidades isoladas, esses recursos criam um ecossistema onde o profissional passa a depender não apenas das ferramentas, mas também da inteligência gerada pelos dados acumulados da própria plataforma, estabelecendo uma vantagem competitiva sustentável ao longo do tempo.
