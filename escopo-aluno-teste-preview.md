# Escopo: Aluno de Teste (preview ao vivo) + Banner personalizado (Elite)

> **Status: escopo desenhado, NADA implementado ainda** (registrado em 2026-08-01). Motivado por uma dor real do profissional: hoje ele não tem nenhum jeito de ver como o app do aluno realmente fica depois de configurar cor/logo — só uma prévia estática reduzida (`perfil.html`, modal "Visualizar como aluno"), que não é o app de verdade, não reage a interação, não mostra dark mode, não mostra as telas com dado real. Isso ficou ainda mais evidente ao desenhar a ideia de banner personalizado (Elite) — julgar se um logo continua legível sobre uma foto de capa arbitrária só dá pra fazer vendo o app de verdade, ao vivo.

---

## 1. Decisão de abordagem já fechada: Aluno de Teste > simulação de navegação

Duas opções foram comparadas antes de fechar esta:

- **Opção A (rejeitada)**: um modo "visualizar como aluno" que simula a navegação inteira do `aluno.html` com dado fake. Problema: exigiria manter uma segunda versão de cada tela pra sempre (toda feature nova do aluno precisaria de uma versão simulada equivalente) — trabalho duplicado permanente, e o resultado tende a parecer vazio/artificial (sem treino real atribuído, sem avaliação real).
- **Opção B (escolhida)**: um aluno de teste de verdade (linha real em `students`, com uma tag `is_test`) que o profissional pode configurar e "entrar" pra navegar como se fosse ele — reaproveitando o `aluno.html` 100% de verdade, sem nenhuma duplicação. Serve de quebra também como ferramenta de venda: mostrar o app de verdade, funcionando, pro aluno de carne e osso antes dele assinar.

Nenhuma pesquisa de mercado encontrou documentação pública de concorrentes (Trainerize, TrueCoach) fazendo algo equivalente — Trainerize tem app white-label de verdade (setup fee, app próprio na loja), TrueCoach não chega a oferecer white-label completo. A decisão acima foi tomada por raciocínio de custo/benefício de engenharia e fidelidade da prévia, não por cópia de concorrente.

---

## 2. Aluno de Teste — desenho completo

### 2.1 Schema

- `students.is_test boolean not null default false`.
- Nenhuma tabela nova — um aluno de teste é uma linha normal de `students`, só marcada. Todas as tabelas de dado do aluno (treinos, avaliações, nutrição, etc.) funcionam exatamente igual, sem precisar de nenhuma adaptação — é dado real, só que de um aluno fictício.
- `students.email` vira **opcional** só quando `is_test = true` (constraint: `check (is_test or email is not null)` — aluno real continua exigindo e-mail, teste não).

### 2.2 Criação

- Dentro do mesmo formulário "Adicionar aluno" (`alunos.html`), não um fluxo separado — reduz duplicação de UI. Checkbox novo: **"Este é um aluno de teste (sem login, só pra eu navegar e testar)"**.
- Quando marcado: campo de e-mail vira opcional (placeholder muda pra "Sem e-mail — aluno de teste"), e os campos de WhatsApp/mensalidade/gênero somem do formulário (irrelevantes pra um aluno fictício — evita o profissional preencher dado que não serve pra nada).
- **Banner de convite não deve aparecer** depois de criar um aluno de teste (hoje `alunos.html` mostra automaticamente "Aluno cadastrado! Enviar convite" — precisa de uma checagem `if (!novoAluno.is_test)` antes de mostrar esse banner, senão o profissional veria um convite que não faz sentido pra enviar).
- **Cap: 1 aluno de teste por profissional.** Simples de explicar, evita abuso (usar "alunos de teste" como vagas extras grátis fora do limite do plano). Se já existir um e o profissional tentar criar outro, bloquear com mensagem clara: "Você já tem um aluno de teste (Fulano) — edite ele ou exclua antes de criar outro." (index em banco: `unique (professional_id) where is_test` — garantia por constraint, não só checagem client-side, mesmo princípio "garantia, não esperança" usado em outras partes do projeto).

### 2.3 Separação visual na lista de alunos

- Aluno de teste **não fica misturado** na lista "Meus alunos" — vive num card próprio, pequeno, logo acima (ex: "Aluno de teste" com o nome + botão "Navegar como este aluno" + "Editar"/"Excluir"), claramente distinto visualmente (borda/tag diferenciada) pra nunca ser confundido com um aluno real numa lista que pode ter centenas de linhas.
- Card mostra também um resumo rápido do estado (tem protocolo? já foi promovido?) — sem exigir abrir o painel de edição pra saber.

### 2.4 Modo "sudo" — como o profissional navega como esse aluno, sem criar uma sessão de login

**Decisão de segurança central**: nunca gerar um login/sessão nova pro aluno de teste (nunca usar a Admin API pra criar um token de personificação) — o profissional continua autenticado como ele mesmo o tempo todo. Em vez disso:

- Botão "Navegar como este aluno" abre `aluno.html?sudo_student_id=<uuid>` numa aba/rota especial.
- `boot()` do `aluno.html` ganha um branch novo: se `sudo_student_id` está presente na URL, ignora a resolução normal por e-mail e faz `select * from students where id = :sudo_student_id and professional_id = (select id from professionals where email = session.user.email) and is_test = true`. **Só entra em modo sudo se essa query retornar uma linha** — qualquer tentativa de usar o parâmetro contra um aluno real, ou de um profissional que não é dono, retorna vazio e o modo sudo é ignorado (cai no fluxo normal, que provavelmente redireciona pro próprio painel do profissional). A trava real está nessa condição (`is_test = true` + posse), não na existência do parâmetro na URL — garantia server-side via RLS (a policy "professional manages own students" já impede ler/escrever aluno de outro profissional) mais a checagem explícita de `is_test`.
- Nenhuma RPC nova precisa existir só pra "entrar" — é uma leitura direta já coberta pela RLS existente.
- Todas as escritas feitas durante o modo sudo (marcar série feita, salvar anamnese, etc.) continuam carimbadas com o JWT real do profissional — nunca existe um token "do aluno" separado circulando, o que elimina a superfície de risco de vazamento de token de personificação.

### 2.5 Indicador visual permanente do modo teste

- Faixa fixa no topo (acima do topbar normal), sempre visível em toda tela durante o modo sudo: "Modo teste — navegando como {nome do aluno}" + botão "Sair do modo teste". Cor distinta (nunca as cores de marca do preset, pra nunca ser confundida com o app real) — sugestão: âmbar/laranja, cor já usada em avisos no resto do app.
- **Cuidado crítico, achado só de propósito procurando esse tipo de coisa**: o botão "Sair" que já existe dentro de `aluno.html` (Configurações) chama `supa.auth.signOut()` — se o profissional clicar nesse botão normal enquanto está em modo sudo, ele desloga a **própria conta de profissional**, não "sai do aluno de teste"! Isso precisa ser tratado explicitamente: em modo sudo, o botão "Sair" das Configurações precisa ficar oculto ou trocado por "Sair do modo teste" (mesmo destino da faixa fixa, `window.location.href = 'alunos.html'`, **nunca** `signOut()`). Esse é exatamente o tipo de ponta solta que a regra de análise de fluxo completo existe pra pegar.
- "Sair do modo teste" sempre volta pra `alunos.html` (nunca desloga, nunca precisa de nenhuma limpeza de sessão — como nunca existiu uma sessão nova, não tem nada pra desfazer).

### 2.6 O que muda, tela por tela, durante o modo sudo

| Tela | Comportamento em modo teste |
|---|---|
| Início/Treino/Nutri/Perfil | Funcionam normalmente, dado real gravado normalmente (é assim que o profissional testa de verdade) |
| **Financeiro** | **Aba escondida da navegação inteiramente** — não faz sentido nenhum simular cartão/Pix real pra um aluno fictício, e mostrar vazio/quebrado seria pior que não mostrar |
| **Notificações push** | Toggle "Ativar notificações" some das Configurações — não existe dispositivo real do outro lado |
| **Consentimento LGPD** | Tela de aceite nunca aparece em modo sudo — não é uma pessoa real, não há dado de saúde real de terceiro em jogo |
| **Ranking entre alunos** | Aluno de teste nunca entra na consulta (RPC `get_student_ranking`/`get_professional_student_ranking` ganham `and not s.is_test`) — nunca deveria competir com aluno de verdade |
| Mensagens (chat) | Funciona (útil testar o fluxo), mas **fica marcado com a mesma tag "TESTE"** na inbox do profissional (`mensagens.html`) pra nunca ser confundido com conversa real — decisão de manter visível, não esconder, mas deixar claro que não é uma conversa real |

### 2.7 Intersecção com o resto do app do profissional (achado procurando de propósito, regra da análise de fluxo completo)

- **Contagem de alunos (`index.html` stat-card "alunos", limite do plano em `alunos.html`)**: aluno de teste **nunca conta** — nem pro card de estatística, nem pro limite de 15/40/ilimitado do plano. Consulta de contagem ganha `and not is_test`.
- **Alertas de "nunca treinou"/mensalidade atrasada** (`index.html`): aluno de teste nunca aparece nessa lista — não é um problema real de negócio, só ruído.
- **"Treinos essa semana" (stat-card)**: também exclui aluno de teste, pra não distorcer a métrica real de atividade do negócio do profissional durante uma demonstração.

### 2.8 Exclusão do aluno de teste

- Reaproveita o fluxo já existente de "Excluir aluno" (`alunos.html`, confirmação em 2 passos, sem retenção) — nenhuma lógica nova precisa, já que é uma linha normal de `students` com cascade já configurado em todas as tabelas dependentes.

### 2.9 Promoção pra aluno real — o caminho de volta que faltava pensar

Cenário real que motivou pensar nisso: o profissional monta o protocolo inteiro, mostra o app pro prospect, o prospect topa virar cliente — sseria um desperdício jogar fora tudo que já foi configurado (protocolo, anamnese) só pra recriar do zero como aluno "de verdade".

- Botão novo no card do aluno de teste: **"Transformar em aluno de verdade"** — abre um formulário pedindo e-mail (agora obrigatório) + WhatsApp/mensalidade opcionais (os mesmos campos que tinham sido escondidos na criação).
- Ao confirmar: `update students set is_test = false, email = ..., ... where id = ...` — uma operação atômica só (nunca fica num estado intermediário "meio teste, meio real"). Protocolo, anamnese, avaliações — tudo que já existia continua vinculado à mesma linha, preservado.
- Depois de promovido, passa a valer tudo que vale pra aluno real: conta pro limite do plano, aparece no ranking, pode receber convite de verdade (mesmo botão "Enviar convite" que já existe), pode ativar cobrança automática se o profissional tiver isso configurado.
- **Depois da promoção, o profissional perde o slot de aluno de teste** (índice único permite criar um novo, já que o antigo não é mais `is_test`).

---

## 3. Banner personalizado (Elite) — desenho completo

Motivou a criação do aluno de teste (só dá pra julgar como um banner fica de verdade vendo o app ao vivo), mas é uma feature independente, com seu próprio schema/UI.

### 3.1 Armazenamento

- Reaproveita o bucket `professional-logos` já existente (mesma RLS: profissional CRUD, aluno lê via signed URL) — path novo `{professional_id}/banner.jpg`, mesmo padrão determinístico do logo. Não precisa de bucket novo nem de policy nova.
- Existência resolvida por tentativa de signed URL (mesmo padrão do logo hoje) — não precisa de coluna booleana nova em `professionals`.

### 3.2 Gating por plano

- Upload só visível/habilitado no plano **Elite** (`perfil.html`) — Starter/Pro continuam só com o degradê de cor do preset.
- **Gate também no momento de exibir, não só de upload**: `aluno.html` só usa `banner_url` se `professional.plan === 'elite'` no momento do render — se o profissional fizer downgrade depois de já ter subido um banner, ele para de aparecer imediatamente (volta pro degradê de cor), sem precisar apagar o arquivo. Mesmo padrão já usado em outras features Elite-only do projeto (ex: IA de interpretação de relatório).

### 3.3 Crop

- Reaproveita o mesmo componente de crop (arrastar + zoom) já maduro no app (logo, QR Pix) — mas com uma proporção nova, larga (ex: 21:9 ou 16:9), sem o toggle Quadrado/Círculo do logo (banner é sempre retangular largo).

### 3.4 Exibição — legibilidade garantida, não esperada

- **Risco real identificado**: uma foto arbitrária pode ter qualquer paleta de cor, arriscando os ícones de notificação/menu (já translúcidos) e o texto do nome ficarem ilegíveis sobre ela.
- **Resolvido com scrim obrigatório**: a faixa nunca mostra a foto pura — sempre um degradê escuro semi-transparente por cima (`linear-gradient(rgba(0,0,0,.15), rgba(0,0,0,.35)), url(banner)`), garantindo contraste mínimo pros ícones/texto independente do conteúdo da foto. Mesmo princípio "garantia, não esperança" — não depender do profissional escolher uma foto "que combine".
- O logo continua vazando a borda inferior da faixa exatamente como já funciona hoje (padrão capa+avatar) — nenhuma mudança estrutural aí, só o fundo da faixa muda de degradê de cor pra imagem+scrim.

### 3.5 Remoção/fallback

- Botão "Remover banner" (mesmo padrão do logo) — volta pro degradê de cor do preset escolhido, nunca deixa a faixa vazia/quebrada.

---

## 4. Perguntas em aberto (não decidir agora, retomar quando a implementação começar)

1. Vale um pequeno aviso ao gerar treino por IA pro aluno de teste, avisando que isso consome uma chamada real à API da Claude (custo real, mesmo sendo aluno fictício)? Ou deixar sem aviso, já que é exatamente o tipo de coisa que o profissional quer testar de verdade?
2. Mensagens com aluno de teste ficam visíveis na inbox marcadas como teste (decisão atual, seção 2.6) ou seria melhor escondidas completamente da lista? Registrado como decisão tomada, mas vale confirmar com o usuário antes de codar.
3. O card "Aluno de teste" em `alunos.html` deveria mostrar algum indicador de "já foi promovido alguma vez" ou esse histórico não importa (já que promover apaga o estado de teste pra sempre, sem log)?
4. Formato exato de aspect ratio do banner (16:9 vs 21:9) — decidir olhando como fica na prática, provavelmente durante a implementação mesmo, usando o próprio aluno de teste pra julgar.

## 5. Fora de escopo desta leva

- Nenhuma decisão de arquitetura foi implementada — esquema (`is_test`, índice único, gates de plano) e telas descritas aqui são desenho, não código.
- Não cobre a criação de mais de 1 aluno de teste por profissional (decisão deliberada, ver seção 2.2).
- Não cobre uso do aluno de teste como ferramenta de onboarding automatizado pro profissional (ex: "aluno de teste pré-criado pra todo profissional novo") — se isso fizer sentido no futuro, é uma decisão separada.
