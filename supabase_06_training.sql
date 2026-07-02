-- Função auxiliar: id do professional do usuário logado.
-- SECURITY DEFINER para evitar recursão de RLS ao usar em policies de outras
-- tabelas (mesmo motivo de my_student_professional_ids em supabase_02).
create or replace function my_professional_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from professionals where email = auth.jwt() ->> 'email' limit 1;
$$;

-- Protocolo de treino publicado pelo profissional para um aluno.
create table if not exists training_protocols (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  titulo text not null default 'Protocolo de treino',
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado', 'arquivado')),
  workouts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  publicado_em timestamptz
);

alter table training_protocols enable row level security;

create policy "professional manages own protocols"
  on training_protocols for all
  using (professional_id = my_professional_id());

create policy "student reads own published protocols"
  on training_protocols for select
  using (
    status = 'publicado'
    and student_id in (select id from students where email = auth.jwt() ->> 'email')
  );

-- Histórico de sessões de treino realizadas pelo aluno.
create table if not exists training_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  protocol_id uuid references training_protocols(id) on delete set null,
  session_uid text unique not null,
  completed_at timestamptz not null default now(),
  workout_id text,
  workout_name text,
  minutes integer,
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table training_history enable row level security;

create policy "student manages own history"
  on training_history for all
  using (student_id in (select id from students where email = auth.jwt() ->> 'email'));

create policy "professional reads own students history"
  on training_history for select
  using (
    student_id in (
      select id from students where professional_id = my_professional_id()
    )
  );
