-- Financeiro do aluno (status de mensalidade + Pix) e do profissional
-- (config de recebimento + painel de Receita) — escopo desenhado em
-- 2026-07-23/24, ver CLAUDE.md. Opt-in (default false), mesmo padrão de
-- ranking_enabled (supabase_26_ranking.sql): a aba "Financeiro" só aparece
-- pro aluno se o profissional ligar. O QR code da Pix reaproveita o bucket
-- professional-logos já existente (supabase_27_branding.sql, mesma RLS:
-- profissional CRUD, aluno só lê) — path novo determinístico
-- {professional_id}/pix-qr.png, sem bucket nem policy de storage nova.
alter table professionals add column if not exists payment_info_enabled boolean not null default false;
alter table professionals add column if not exists pix_key_text text;
