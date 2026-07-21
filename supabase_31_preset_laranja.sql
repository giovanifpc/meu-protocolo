-- 6º preset de cor — "Laranja Vibrante". Motivo puramente de layout: 5
-- presets numa grade de 3 colunas deixava uma lacuna (3 em cima, 2 embaixo,
-- assimétrico); 6 fecha a grade certinho (3+3).
alter table professionals drop constraint if exists professionals_color_preset_check;
alter table professionals add constraint professionals_color_preset_check
  check (color_preset in ('azul', 'vinho', 'roxo', 'verde', 'rosa', 'laranja'));
