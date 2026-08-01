-- Aumenta o limite de tamanho do bucket nutri-pdfs, de 10MB pra 20MB
-- (2026-08-01). Motivado por relato real da Livia (Cliente 0) no chat de
-- suporte: upload de PDF do plano nutricional falhando com uma mensagem
-- genérica, sem ela nunca ter voltado pra confirmar o motivo exato. Mesma
-- classe de bug já vista antes neste projeto (bucket assessment-photos,
-- 8MB — fotos de avaliação física tiradas de celular estouravam o limite
-- silenciosamente). Um PDF de plano nutricional escaneado/com foto de
-- página facilmente passa dos 10MB originais — 20MB dá bastante folga sem
-- abrir mão de um teto razoável.
update storage.buckets
set file_size_limit = 20971520 -- 20MB
where id = 'nutri-pdfs';
