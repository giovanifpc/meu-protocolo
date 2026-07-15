-- Expurgo automático de dados 30 dias após cancelamento de assinatura.
-- Cumpre a promessa feita em privacidade.html ("após os 30 dias, os dados
-- são excluídos permanentemente") — sem isso, cancelar só muda o status
-- pra 'inativo' e os dados de saúde do aluno ficam guardados pra sempre.
--
-- Deletar a linha de professionals é suficiente: todo FK de tabela de aluno
-- (students, training_protocols/history, physical_assessments,
-- nutrition_guidance, student_notes, student_anamnese, push_subscriptions,
-- student_notifications, student_consent) já é "on delete cascade" — não
-- precisa apagar tabela por tabela. billing_events é exceção deliberada:
-- referencia professional_id com "on delete set null", então o log de
-- cobrança sobrevive (é dado operacional nosso, não dado pessoal do aluno).

create extension if not exists pg_cron;

create or replace function purge_inactive_professionals()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from professionals
  where status = 'inativo'
    and inactive_since is not null
    and inactive_since < now() - interval '30 days';
end;
$$;

-- Roda todo dia às 3h (horário do servidor, UTC). NÃO agendado ainda por
-- padrão — rodar o select cron.schedule(...) abaixo manualmente só depois
-- de confirmar com o usuário, já que isso liga um expurgo automático e
-- irreversível de dado real em produção.
-- select cron.schedule(
--   'purge-inactive-professionals-daily',
--   '0 3 * * *',
--   $$select purge_inactive_professionals();$$
-- );
