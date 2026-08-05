-- Observação do aluno no fim do treino (RPE 1-10 + texto livre opcional,
-- ver aluno.html) nunca tinha nenhum lugar visível pro profissional — só
-- existia dentro do relatório de texto gerado sob demanda (relatorios.html,
-- "Observação do aluno: ..."), fácil de nunca ser lido de verdade. Motivado
-- por pedido real do usuário (2026-08-05): quer um alerta passivo na
-- Início + uma tela de histórico completo por aluno (ver historico.html).
--
-- training_history JÁ é lido pelo profissional via RLS
-- ("professional reads own students history", supabase_06_training.sql) —
-- não precisa de policy nova pra leitura. O que falta é um jeito de marcar
-- uma observação como "já vi" (pro alerta da Início parar de mostrar) —
-- o profissional não tem nenhuma policy de UPDATE nessa tabela hoje (só o
-- aluno, "student manages own history" for all), e não deveria ganhar uma
-- policy de update aberta só pra isso — escrita controlada por RPC
-- SECURITY DEFINER, mesmo padrão já usado no resto do projeto.

alter table training_history add column if not exists observation_seen_at timestamptz;

create or replace function mark_training_observation_seen(p_session_uid text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professional_id uuid;
begin
  select id into v_professional_id from professionals where email = auth.jwt() ->> 'email';
  if v_professional_id is null then
    raise exception 'Apenas profissionais podem marcar uma observação como vista.';
  end if;

  update training_history th
  set observation_seen_at = now()
  from students s
  where th.session_uid = p_session_uid
    and s.id = th.student_id
    and s.professional_id = v_professional_id;
end;
$$;
