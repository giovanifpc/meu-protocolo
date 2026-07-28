-- Estende push_subscriptions pro profissional também (2026-07-28). Até aqui só
-- o aluno podia assinar push — decisão de 2026-07-09, pensada só na direção
-- profissional->aluno (lembrete de treino/mensalidade). O sino do profissional
-- (professional_notifications, supabase_45, 2026-07-27) ficou só in-app desde
-- então, sem push real, por nunca ter sido revisitado — não foi decisão
-- deliberada, foi lacuna encontrada nesta sessão. Esta migration fecha isso.

alter table push_subscriptions alter column student_id drop not null;
alter table push_subscriptions add column if not exists professional_id uuid references professionals(id) on delete cascade;

alter table push_subscriptions add constraint push_subscriptions_owner_check
  check (
    (student_id is not null and professional_id is null)
    or (professional_id is not null and student_id is null)
  );

-- unique(student_id, endpoint) já existia e continua valendo pro aluno sem
-- mudança nenhuma (nunca colide com linha de profissional, que tem
-- student_id sempre nulo). Só precisa de uma constraint irmã pro profissional.
alter table push_subscriptions add constraint push_subscriptions_professional_endpoint_key
  unique (professional_id, endpoint);

create policy "professional manages own push subscriptions"
  on push_subscriptions for all
  using (professional_id in (select id from professionals where email = auth.jwt() ->> 'email'));
