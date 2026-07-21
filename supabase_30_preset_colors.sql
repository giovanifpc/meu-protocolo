-- Ajuste de paleta pedido pelo usuário (2026-07-21, depois de ver os
-- presets em produção): "Grafite Executivo" saiu — cinza lê como "elemento
-- desabilitado" na UI, não como cor de marca, e ficava especialmente
-- apagado/confuso no modo escuro. Dois novos no lugar: "Verde Vibrante"
-- (estilo Spotify) e "Rosa Suave" (público de profissionais mulheres).
-- Nenhum profissional real tinha 'grafite' em produção (só a conta sandbox,
-- já revertida) — a migração abaixo é só uma rede de segurança.
alter table professionals drop constraint if exists professionals_color_preset_check;
alter table professionals add constraint professionals_color_preset_check
  check (color_preset in ('azul', 'vinho', 'roxo', 'verde', 'rosa'));
update professionals set color_preset = 'azul' where color_preset not in ('azul', 'vinho', 'roxo', 'verde', 'rosa');
