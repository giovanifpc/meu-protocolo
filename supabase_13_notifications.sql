-- Registro das notificações enviadas pro aluno (push ou não). A Edge
-- Function send-push grava aqui toda vez que dispara, independente de o
-- aluno ter push ativado — assim a mensagem fica visível dentro do app
-- mesmo se a notificação do sistema for perdida/dispensada.
create table if not exists student_notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table student_notifications enable row level security;

create policy "student manages own notifications"
  on student_notifications for all
  using (student_id in (select id from students where email = auth.jwt() ->> 'email'));
