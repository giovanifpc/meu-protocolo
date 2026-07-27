-- Bug real (2026-07-27): uma sessão do e-mail master vazou pra uma aba com
-- onboarding.html aberta (localStorage de sessão é compartilhado entre abas
-- do mesmo navegador — a sessão mais recente sobrescreve a anterior) e criou
-- uma linha comum em professionals pro e-mail meuprotocolo1@gmail.com.
-- login.html sempre intercepta esse e-mail e manda pra master.html ANTES de
-- checar a tabela professionals, então essa linha ficou inacessível pra
-- sempre pelo fluxo normal — um profissional "fantasma".
--
-- onboarding.html/index.html já ganharam a mesma trava no client (ver
-- commit), mas isso é só a primeira linha de defesa. Esta constraint é a
-- garantia de verdade: torna esse estado impossível a nível de banco,
-- independente de qualquer bug futuro de tela.

-- 1) Limpa o fantasma já criado. REVISAR antes de rodar: confirma que é
-- mesmo só essa linha órfã (sem alunos/dados reais vinculados) antes de
-- apagar — select primeiro:
--   select id, email, display_name, plan, status, created_at
--   from professionals where email = 'meuprotocolo1@gmail.com';
delete from professionals where email = 'meuprotocolo1@gmail.com';

-- 2) Trava a nível de banco: nunca mais permite esse e-mail em professionals.
alter table professionals
  add constraint professionals_email_not_master
  check (email <> 'meuprotocolo1@gmail.com');
