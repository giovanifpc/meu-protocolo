// Cancela a assinatura recorrente do profissional no Mercado Pago (PUT
// /preapproval/{id} com status "cancelled") antes do fluxo de cancelamento
// marcar a conta como inativa localmente — sem isso, o app achava que tinha
// cancelado mas o Mercado Pago continuava cobrando o cartão todo mês.
//
// Deploy:   supabase functions deploy mercadopago-cancel-preapproval
// Secret:   supabase secrets set MERCADOPAGO_ACCESS_TOKEN=... (já existe)
//
// Chamada por perfil.html, antes de marcar professionals.status = 'inativo'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;

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
    if (!user) throw new Error('Sessão inválida.');

    const { data: professional, error: proErr } = await supa
      .from('professionals').select('id, email, mp_preapproval_id').eq('email', user.email).maybeSingle();
    if (proErr || !professional) throw new Error('Profissional não encontrado.');

    // Sem assinatura criada no Mercado Pago ainda (ex: nunca terminou o passo
    // do cartão no onboarding) — não há nada pra cancelar lá, só localmente.
    if (!professional.mp_preapproval_id) {
      return jsonResponse({ cancelled: false, reason: 'sem assinatura no Mercado Pago' });
    }

    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${professional.mp_preapproval_id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'cancelled' }),
    });

    const mpBodyText = await mpRes.text();
    let mpData: any = null;
    try { mpData = JSON.parse(mpBodyText); } catch { /* resposta não-JSON, tratado abaixo */ }

    if (!mpRes.ok) {
      throw new Error(`Erro ao cancelar assinatura no Mercado Pago (status ${mpRes.status}): ${mpData?.message || mpBodyText || 'corpo vazio'}`);
    }

    return jsonResponse({ cancelled: true, status: mpData?.status || 'cancelled' });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
