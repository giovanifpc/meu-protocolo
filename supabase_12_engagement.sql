-- Pacote de "comodidades pro profissional": alertas de adesão/pagamento sem
-- gateway (o app só acompanha datas e prepara a mensagem — quem cobra e quem
-- envia é o profissional, via WhatsApp), biblioteca de protocolos-modelo,
-- anamnese digital e push notifications.

-- Telefone (pro link do WhatsApp) + acompanhamento de mensalidade (sem
-- processar pagamento — só data de vencimento e "marquei como recebido").
alter table students add column if not exists telefone text;
alter table students add column if not exists mensalidade_valor numeric;
alter table students add column if not exists mensalidade_dia_vencimento integer check (mensalidade_dia_vencimento between 1 and 31);
alter table students add column if not exists ultimo_pagamento_em date;

-- Biblioteca de protocolos-modelo: mesma estrutura de training_protocols,
-- mas sem student_id — o profissional monta uma vez e aplica em qualquer
-- aluno depois (evolução do "duplicar protocolo de outro aluno").
create table if not exists protocol_templates (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  titulo text not null default 'Modelo de protocolo',
  periodizacao text not null default 'manual',
  duracao_semanas integer,
  workouts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table protocol_templates enable row level security;

create policy "professional manages own protocol templates"
  on protocol_templates for all
  using (professional_id = my_professional_id());

-- Anamnese/PAR-Q: triagem de saúde que o aluno preenche sobre si mesmo — é
-- o dono do dado, o profissional só lê (mesmo padrão de training_history:
-- aluno tem CRUD completo na própria linha, profissional só enxerga).
create table if not exists student_anamnese (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references students(id) on delete cascade,
  objetivo text,
  historico_medico text,
  lesoes text,
  cirurgias text,
  medicamentos text,
  fumante boolean,
  restricoes text,
  observacoes text,
  respondido_em timestamptz,
  updated_at timestamptz not null default now()
);

alter table student_anamnese enable row level security;

create policy "student manages own anamnese"
  on student_anamnese for all
  using (student_id in (select id from students where email = auth.jwt() ->> 'email'));

create policy "professional reads own students anamnese"
  on student_anamnese for select
  using (
    student_id in (
      select id from students where professional_id = my_professional_id()
    )
  );

create or replace function touch_student_anamnese_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists student_anamnese_touch_updated_at on student_anamnese;
create trigger student_anamnese_touch_updated_at
  before update on student_anamnese
  for each row
  execute function touch_student_anamnese_updated_at();

-- Push notifications: só o aluno assina (lembrete de treino, reengajamento).
-- O envio é feito por uma Edge Function com service role (não precisa de
-- policy de leitura pro profissional — a função de envio já ignora RLS).
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (student_id, endpoint)
);

alter table push_subscriptions enable row level security;

create policy "student manages own push subscriptions"
  on push_subscriptions for all
  using (student_id in (select id from students where email = auth.jwt() ->> 'email'));
