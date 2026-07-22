-- Mensageria dentro do app entre profissional e aluno (item 18 do roadmap,
-- adiado deliberadamente até aqui — hoje o contato usa WhatsApp/push).
-- Chat com histórico, um thread por par profissional×aluno.
--
-- Acesso 100% via RPCs SECURITY DEFINER, sem nenhuma policy de RLS liberando
-- select/insert/update direto na tabela via PostgREST — mesmo padrão de
-- blindagem total já usado em support_messages/assistant_hint_events (RLS
-- habilitada, mas o app nunca fala com a tabela crua, só com as funções
-- abaixo, que resolvem a identidade de quem chama internamente por e-mail).
-- Motivo de não usar RLS "aberta" pros dois lados: evita ter que expressar em
-- policy toda a lógica de "só posso postar como eu mesmo, e só nessa
-- conversa" — mais simples e mais seguro concentrar isso em plpgsql.

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  sender text not null check (sender in ('professional', 'student')),
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table messages enable row level security;

create index if not exists messages_student_id_created_at_idx on messages (student_id, created_at);

-- Envia uma mensagem — resolve sozinho se quem chama é o profissional daquele
-- aluno ou o próprio aluno (nunca confia num "sender" mandado pelo client).
-- Quando é o profissional enviando, também gera a notificação no sino que o
-- aluno já usa (student_notifications) — é o que faz "Nova mensagem"
-- aparecer lá, sem precisar de um segundo sistema de notificação.
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
    insert into messages (professional_id, student_id, sender, body)
    select professional_id, id, 'student', v_body from students where id = p_student_id;
    return;
  end if;

  raise exception 'Não autorizado.';
end;
$$;

-- Histórico completo da conversa com um aluno específico — checa que quem
-- chama é o profissional daquele aluno OU o próprio aluno antes de devolver.
create or replace function get_conversation(p_student_id uuid)
returns table (id uuid, sender text, body text, created_at timestamptz, read_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := auth.jwt() ->> 'email';
  v_authorized boolean;
begin
  select exists(
    select 1 from students s join professionals p on p.id = s.professional_id
    where s.id = p_student_id and p.email = v_email
  ) or exists(
    select 1 from students s where s.id = p_student_id and s.email = v_email
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Não autorizado.';
  end if;

  return query
  select m.id, m.sender, m.body, m.created_at, m.read_at
  from messages m
  where m.student_id = p_student_id
  order by m.created_at asc;
end;
$$;

-- Marca como lidas as mensagens da OUTRA parte — chamado ao abrir a
-- conversa. Profissional lê as do aluno, aluno lê as do profissional.
create or replace function mark_messages_read(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := auth.jwt() ->> 'email';
  v_is_professional boolean;
  v_is_this_student boolean;
begin
  select exists(
    select 1 from students s join professionals p on p.id = s.professional_id
    where s.id = p_student_id and p.email = v_email
  ) into v_is_professional;

  if v_is_professional then
    update messages set read_at = now()
    where student_id = p_student_id and sender = 'student' and read_at is null;
    return;
  end if;

  select exists(select 1 from students where id = p_student_id and email = v_email) into v_is_this_student;
  if v_is_this_student then
    update messages set read_at = now()
    where student_id = p_student_id and sender = 'professional' and read_at is null;
    return;
  end if;

  raise exception 'Não autorizado.';
end;
$$;

-- Badge de não-lida no ícone de mensagem da Início do aluno — contagem só,
-- sem trazer o conteúdo (a tela de chat busca o conteúdo à parte).
create or replace function get_student_unread_message_count()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*) from messages
  where student_id = (select id from students where email = auth.jwt() ->> 'email')
    and sender = 'professional' and read_at is null;
$$;

-- Badge de não-lida no ícone "Mensagens" da navegação do profissional —
-- chamado em toda página do painel (index/alunos/relatorios/perfil), por
-- isso fica separado do get_professional_conversations() (mais pesado, só
-- roda de fato dentro de mensagens.html).
create or replace function get_professional_unread_message_count()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)
  from messages m
  join students s on s.id = m.student_id
  where s.professional_id = (select id from professionals where email = auth.jwt() ->> 'email')
    and m.sender = 'student' and m.read_at is null;
$$;

-- Inbox do profissional — um item por aluno com conversa (join lateral, não
-- left join: aluno sem nenhuma mensagem trocada simplesmente não aparece),
-- com a última mensagem + contagem de não-lidas do aluno pra ordenar/badge.
create or replace function get_professional_conversations()
returns table (
  student_id uuid,
  student_nome text,
  last_message text,
  last_sender text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.nome,
    lm.body,
    lm.sender,
    lm.created_at,
    coalesce(uc.unread, 0)
  from students s
  join lateral (
    select body, sender, created_at from messages m
    where m.student_id = s.id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*) as unread from messages m2
    where m2.student_id = s.id and m2.sender = 'student' and m2.read_at is null
  ) uc on true
  where s.professional_id = (select id from professionals where email = auth.jwt() ->> 'email')
  order by lm.created_at desc;
$$;
