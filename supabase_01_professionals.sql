-- Tabela professionals: tenant raiz. Cada linha é um personal trainer assinante.
create table if not exists professionals (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text not null,
  logo_url text,
  primary_color text,
  plan text not null default 'starter' check (plan in ('starter', 'pro', 'elite')),
  status text not null default 'trial' check (status in ('trial', 'ativo', 'inativo', 'deletado')),
  trial_ends_at timestamptz,
  inactive_since timestamptz,
  created_at timestamptz not null default now()
);

alter table professionals enable row level security;

-- Um profissional só enxerga e edita a própria linha (via email do JWT)
create policy "professional reads own row"
  on professionals for select
  using (email = auth.jwt() ->> 'email');

create policy "professional updates own row"
  on professionals for update
  using (email = auth.jwt() ->> 'email');

-- Permite que o profissional crie a própria linha no primeiro login (onboarding)
create policy "professional creates own row"
  on professionals for insert
  with check (email = auth.jwt() ->> 'email');

-- Nota: a policy "aluno lê o próprio professional" é criada em supabase_02_students.sql,
-- pois depende da tabela students já existir. Rodar os arquivos supabase_0N_*.sql em ordem numérica.
