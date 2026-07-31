-- Gênero do aluno — usado só como sinal de calibração no treino gerado por
-- IA (ver generate-workout), nunca em relatório/avaliação (que já tem seu
-- próprio "sexo" em physical_assessments, por motivo diferente: fórmula de
-- dobras cutâneas muda por medição, não é dado fixo do cadastro).
-- Opcional (nullable) — aluno cadastrado antes desta migration, ou sem
-- informação, segue null: a IA não aplica nenhum viés de ênfase nesse caso.
alter table students
  add column if not exists genero text check (genero in ('M', 'F'));
