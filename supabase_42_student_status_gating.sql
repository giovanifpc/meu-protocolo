-- students.status vira controle de acesso de verdade (2026-07-24) — antes
-- vivia só em student_notes (nota privada do profissional), sem nenhum
-- efeito real: um aluno marcado "Inativo" continuava logando e usando o
-- app normalmente até o profissional excluir a conta de vez. Usuário
-- reportou isso como um problema real: sem um jeito de suspender acesso
-- sem apagar dado, o profissional tende a não excluir (esperança de reatar
-- o serviço depois) e o aluno antigo continua usando o app indefinidamente.
--
-- Status agora mora em students (é dado de controle de conta, não nota
-- privada) — RLS "student reads own row" já cobre a leitura própria, sem
-- precisar de RPC nova; só o profissional escreve (RLS "professional
-- manages own students" já cobre). login.html e aluno.html passam a checar
-- isso e bloquear ativamente o acesso quando 'inativo'.
alter table students add column if not exists status text not null default 'ativo' check (status in ('ativo','pausado','inativo'));

-- Backfill do valor já cadastrado em student_notes, pra não resetar o
-- status de quem já tinha marcado algum aluno como pausado/inativo antes
-- desta migration.
update students s
set status = sn.status
from student_notes sn
where sn.student_id = s.id and sn.status is not null;

-- Sem uso a partir de agora — status de verdade vive só em students,
-- nunca duas fontes da mesma informação.
alter table student_notes drop column if exists status;
