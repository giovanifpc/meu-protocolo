-- Periodização do protocolo de treino: técnica escolhida + duração do ciclo.
-- Cada exercício dentro de workouts (jsonb) passa a guardar um array `weeks`
-- com sets/reps/rest por semana em vez de um valor fixo — não precisa de
-- migration pra isso (jsonb é livre de schema); protocolos antigos sem
-- `weeks` continuam funcionando (aluno.html cai no formato flat como fallback).

alter table training_protocols
  add column if not exists periodizacao text not null default 'manual'
  check (periodizacao in ('manual', 'linear', 'ondulatoria_diaria', 'ondulatoria_semanal', 'blocos', 'reversa'));

alter table training_protocols
  add column if not exists duracao_semanas integer;
