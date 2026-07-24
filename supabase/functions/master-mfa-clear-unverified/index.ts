// Limpa fatores TOTP "unverified" travados do painel master antes de um
// novo cadastro — corrige um impasse real encontrado em produção
// (2026-07-24): showEnrollScreen() em master.html tentava limpar esses
// fatores via supabase.auth.mfa.unenroll() (client SDK), mas o Supabase
// exige aal2 pra remover QUALQUER fator, incluindo os não verificados — e
// quem está tentando cadastrar o autenticador pela primeira vez está
// necessariamente em aal1. Resultado: um cadastro abandonado no meio
// (ex: página fechada/recarregada antes de digitar o código) deixava um
// fator "fantasma" que bloqueava qualquer tentativa nova de cadastro pra
// sempre (erro "friendly name already exists"), sem nenhuma saída na UI.
//
// Seguro por design: só apaga fatores com status 'unverified' (nunca
// serviram de proteção real — não são o que protege o painel master) e só
// depois de confirmar, via Admin API, que não existe fator VERIFICADO pro
// mesmo usuário (nunca mexe num autenticador que já está em uso; isso
// continua exigindo o fluxo de código de recuperação, master-mfa-recovery).
// Não precisa de código de recuperação porque não há nada de valor sendo
// removido — mesma lógica de "resetar um formulário que não foi enviado".
//
// Deploy: supabase functions deploy master-mfa-clear-unverified

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autenticado.');

    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user || user.email !== 'meuprotocolo1@gmail.com') throw new Error('Não autorizado.');

    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: getUserErr } = await supaAdmin.auth.admin.getUserById(user.id);
    if (getUserErr) throw new Error('Falhou ao localizar os fatores MFA: ' + getUserErr.message);

    const factors = userData?.user?.factors || [];
    const hasVerified = factors.some((f) => f.status === 'verified');
    if (hasVerified) {
      // Já existe um autenticador de verdade em uso — nunca mexer aqui.
      // O caminho certo pra esse caso é o de código de recuperação.
      return jsonResponse({ ok: true, factorsRemoved: 0 });
    }

    const unverified = factors.filter((f) => f.status !== 'verified');
    for (const factor of unverified) {
      const { error: delErr } = await supaAdmin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id });
      if (delErr) throw new Error('Falhou ao limpar cadastro anterior: ' + delErr.message);
    }

    return jsonResponse({ ok: true, factorsRemoved: unverified.length });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
