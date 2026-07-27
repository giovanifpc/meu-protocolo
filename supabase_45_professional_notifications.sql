-- Sino de notificações do profissional (2026-07-27) — mesmo conceito de
-- student_notifications (supabase_13), só que na direção contrária. Antes,
-- o profissional não tinha nenhum histórico de eventos, só o badge de
-- mensagem não lida (get_professional_unread_message_count). Este é um log
-- mais amplo, pensado pra crescer com novos gatilhos no futuro.
create table if not exists professional_notifications (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table professional_notifications enable row level security;

create policy "professional manages own notifications"
  on professional_notifications for all
  using (professional_id in (select id from professionals where email = auth.jwt() ->> 'email'));

create index if not exists professional_notifications_professional_id_created_at_idx
  on professional_notifications (professional_id, created_at desc);

-- Gatilho 1: aluno manda mensagem — send_message() (supabase_35) já grava a
-- notificação simétrica pro aluno quando é o profissional que manda
-- (student_notifications); faltava o caminho inverso. Reescreve a função
-- inteira (mesmo corpo de supabase_35) só acrescentando esse insert no
-- branch do aluno.
create or replace function send_message(p_student_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := auth.jwt() ->> 'email';
  v_professional_id uuid;
  v_professional_name text;
  v_is_this_student boolean;
  v_body text := trim(p_body);
  v_student_nome text;
begin
  if v_body is null or v_body = '' then
    raise exception 'Mensagem vazia.';
  end if;

  select s.professional_id, p.display_name into v_professional_id, v_professional_name
  from students s
  join professionals p on p.id = s.professional_id
  where s.id = p_student_id and p.email = v_email;

  if v_professional_id is not null then
    insert into messages (professional_id, student_id, sender, body)
    values (v_professional_id, p_student_id, 'professional', v_body);

    insert into student_notifications (student_id, title, body)
    values (p_student_id, 'Nova mensagem de ' || v_professional_name, v_body);
    return;
  end if;

  select exists(select 1 from students where id = p_student_id and email = v_email) into v_is_this_student;
  if v_is_this_student then
    select s.professional_id, s.nome into v_professional_id, v_student_nome
    from students s where s.id = p_student_id;

    insert into messages (professional_id, student_id, sender, body)
    values (v_professional_id, p_student_id, 'student', v_body);

    insert into professional_notifications (professional_id, title, body)
    values (v_professional_id, 'Nova mensagem de ' || v_student_nome, v_body);
    return;
  end if;

  raise exception 'Não autorizado.';
end;
$$;

-- Gatilho 2: aluno respondeu a anamnese pela 1ª vez. O app só faz INSERT em
-- student_anamnese uma única vez por aluno (saves seguintes são UPDATE, ver
-- aluno.html) — então AFTER INSERT já é exatamente "primeira resposta",
-- sem precisar inspecionar o conteúdo dos campos.
create or replace function notify_professional_anamnese_answered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professional_id uuid;
  v_student_nome text;
begin
  select s.professional_id, s.nome into v_professional_id, v_student_nome
  from students s where s.id = new.student_id;

  if v_professional_id is not null then
    insert into professional_notifications (professional_id, title, body)
    values (v_professional_id, v_student_nome || ' respondeu a anamnese', 'Confira em Avaliação › Anamnese.');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_anamnese_answered on student_anamnese;
create trigger trg_notify_anamnese_answered
  after insert on student_anamnese
  for each row execute function notify_professional_anamnese_answered();
