-- Frase de boas-vindas da Início do aluno ("Sua evolução começa hoje.") era
-- texto fixo em aluno.html, sem nenhuma forma de o profissional editar —
-- pedido do usuário depois de ver a prévia real do banner em perfil.html
-- (2026-07-24). NULL cai no mesmo texto padrão de sempre (fallback no
-- client, não aqui), pra não forçar todo profissional existente a digitar
-- algo antes de continuar vendo a Início normalmente.
alter table professionals add column if not exists home_subtitle text;
