-- WhatsApp do profissional — usado no banner novo da tela Início do aluno
-- (item 15 da reestruturação de navegação, 2026-07-21). Caminho inverso do
-- que já existia (students.telefone, usado pelo profissional pra contatar
-- o aluno) — aqui é o aluno contatando o profissional.
alter table professionals add column if not exists whatsapp text;
