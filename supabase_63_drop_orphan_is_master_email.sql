-- Achado real de varredura de fluxo (2026-08-05, já registrado no CLAUDE.md
-- antes): is_master_email(check_email) foi criada como helper de
-- supabase_16 mas nunca chegou a ser usada em lugar nenhum -- toda a
-- checagem real do e-mail master é feita inline (auth.jwt() ->> 'email' =
-- 'meuprotocolo1@gmail.com') em cada RPC/página que precisa. Confirmado
-- zero referência em todo o repositório (grep) antes de remover.
drop function if exists is_master_email(text);
