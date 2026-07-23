// Recuperação de acesso ao painel master quando o autenticador (TOTP) é
// perdido — item 17 do roadmap, fechando a lacuna de "e se o Giovani trocar
// de celular ou perder o app autenticador?". Sem isso, exigir 2FA no master
// criaria um risco de lockout permanente (ninguém mais tem acesso pra
// resetar o fator, é uma conta única, sem time de suporte por trás).
//
// Deploy:   supabase functions deploy master-mfa-recovery
// Secret:   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... (já existe)
//
// Fluxo: o master.html chama isso só quando o profissional já provou ser
// dono da sessão do e-mail master (login OTP normal) mas não tem mais o
// autenticador — em vez de reautenticar por MFA, ele informa um dos códigos
// de recuperação de uso único gerados no cadastro do autenticador
// (master_generate_recovery_codes, supabase_37). Se o código bater, o fator
// TOTP é apagado via Admin API (nunca é possível fazer isso client-side, só
// com service role) e o master.html reabre a tela de cadastro do zero.

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

    // Client escopado pelo JWT de quem chamou — a RPC abaixo roda com essa
    // identidade e faz a checagem real de "é o e-mail master?" internamente
    // (supabase_16/37), nunca confiando só no fato de ter chegado até aqui.
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user || user.email !== 'meuprotocolo1@gmail.com') throw new Error('Não autorizado.');

    const { code } = await req.json();
    if (!code || typeof code !== 'string') throw new Error('Código de recuperação é obrigatório.');

    const { data: valid, error: verifyErr } = await supa.rpc('master_verify_recovery_code', { p_code: code });
    if (verifyErr) throw new Error('Erro ao verificar código: ' + verifyErr.message);
    if (!valid) throw new Error('Código de recuperação inválido ou já usado.');

    // Só a partir daqui precisa de service role — apagar um fator MFA de um
    // usuário só é possível pela Admin API, nunca pelo client normal.
    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: getUserErr } = await supaAdmin.auth.admin.getUserById(user.id);
    if (getUserErr) throw new Error('Código válido, mas falhou ao localizar os fatores MFA: ' + getUserErr.message);

    const factors = userData?.user?.factors || [];
    for (const factor of factors) {
      const { error: delErr } = await supaAdmin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id });
      if (delErr) throw new Error('Código válido, mas falhou ao remover o autenticador antigo: ' + delErr.message);
    }

    return jsonResponse({ ok: true, factorsRemoved: factors.length });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
