-- RPC pra excluir permanentemente um profissional pelo painel master
-- (2026-08-14) — antes disso não existia nenhum jeito de apagar de
-- verdade uma conta. O único mecanismo de exclusão do projeto era
-- `purge_inactive_professionals()` (supabase_17), que só varre
-- status='inativo' há 30+ dias e, de propósito, nunca foi agendado
-- (aguardando confirmação do usuário antes de ligar um expurgo
-- automático e irreversível). O painel master só tinha um dropdown de
-- status ('trial'/'ativo'/'inativo'/'deletado') — escolher 'deletado'
-- nunca apagou nada, só mudava uma string sem efeito de exclusão real.
--
-- Mesmo padrão de segurança de toda RPC master: SECURITY DEFINER, checa
-- e-mail master + aal2 no servidor — a confirmação no client (digitar o
-- e-mail do profissional antes de chamar) é só UX/fricção contra clique
-- acidental, nunca a fronteira de segurança de verdade.
--
-- Cascade já cuida do resto: toda tabela de dado de aluno referencia
-- professional_id com "on delete cascade" (students,
-- training_protocols/history, physical_assessments, nutrition_guidance,
-- student_notes, student_anamnese, push_subscriptions,
-- student_notifications, student_consent, student_checkins,
-- student_badge_unlocks, protocol_templates, professional_notifications,
-- professional_exercise_videos, referrals, etc. — mesmo design já
-- usado por purge_inactive_professionals). billing_events é exceção
-- deliberada (on delete set null) — log de cobrança sobrevive.
--
-- Importante, documentado pra quem for usar: isso NÃO impede o mesmo
-- e-mail de criar uma conta nova depois (não mexe em auth.users, só na
-- linha de professionals) — pra bloquear o e-mail de continuar
-- acessando sem apagar o histórico, usar status='inativo' em vez de
-- excluir (ou os dois, nessa ordem: inativo primeiro, excluir depois
-- do período de retenção que fizer sentido).
create or replace function master_delete_professional(p_professional_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' or auth.jwt() ->> 'aal' <> 'aal2' then
    raise exception 'Não autorizado.';
  end if;

  delete from professionals where id = p_professional_id;
end;
$$;

revoke execute on function master_delete_professional(uuid) from public, anon;
grant execute on function master_delete_professional(uuid) to authenticated;

-- ── Corrige is_professional_email() pra 'deletado' bloquear de verdade ──
-- Achado na mesma sessão: is_professional_email() (supabase_65) excluía
-- status='deletado' do resultado (`status <> 'deletado'`) — mas NÃO
-- excluía 'inativo'. Consequência real: login.html só bloqueia
-- explicitamente dentro do `if (isPro)` — pra 'inativo' isso funciona
-- (isPro continua true, o bloqueio explícito dispara), mas pra 'deletado'
-- isPro já vinha false, então a pessoa nunca entrava nesse branch e caía
-- no fallback "nunca vi essa conta" (onboarding.html), sem nenhum
-- bloqueio — o oposto do que fazia sentido pro nome do status. Corrigido
-- removendo a exclusão de 'deletado' daqui, tratando os dois status
-- (inativo/deletado) do mesmo jeito: is_professional_email() responde
-- true pra qualquer linha existente não removida fisicamente, e o
-- bloqueio de verdade fica só no client (login.html/onboarding.html),
-- checando o valor exato de status — mesmo padrão dos dois casos agora.
create or replace function is_professional_email()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from professionals
    where email = auth.jwt() ->> 'email'
  );
$$;
