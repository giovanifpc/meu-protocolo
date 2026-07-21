-- Desacopla cor de marca (color_preset) de modo claro/escuro — decisão do
-- usuário em 2026-07-21, logo depois de validar o preset "Escuro" como um
-- dos 5 presets fixos: em vez de "Escuro" ser mais um preset (mutuamente
-- exclusivo com a cor), a cor do profissional (azul/grafite/vinho/roxo)
-- fica independente do modo — e o modo claro/escuro passa a ser decidido
-- pelo ALUNO, seguindo o tema nativo do celular dele por padrão (com opção
-- de sobrepor manualmente), igual ao padrão comum de apps (ex: WhatsApp,
-- Instagram). Não precisa de coluna nova: modo é preferência de aparelho,
-- guardada em localStorage no client — nunca é dado de servidor.
--
-- "escuro" sai da lista de color_preset (não é mais uma cor, é um modo).
-- Nenhum profissional real tinha esse valor em produção (só a conta
-- sandbox, já revertida pra 'azul' antes desta migration).
alter table professionals drop constraint if exists professionals_color_preset_check;
alter table professionals add constraint professionals_color_preset_check
  check (color_preset in ('azul', 'grafite', 'vinho', 'roxo'));
update professionals set color_preset = 'azul' where color_preset not in ('azul', 'grafite', 'vinho', 'roxo');
