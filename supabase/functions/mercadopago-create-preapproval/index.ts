// Cria a assinatura recorrente (preapproval) do profissional no Mercado Pago,
// com trial nativo de 14 dias (o Mercado Pago só cobra o cartão depois desse
// prazo — não precisamos de cron pra disparar a primeira cobrança). Chamada
// pelo onboarding.html depois que o Checkout Bricks (CardForm) tokeniza o
// cartão no navegador — o número do cartão nunca passa por aqui, só o token.
//
// Deploy:   supabase functions deploy mercadopago-create-preapproval
// Secret:   supabase secrets set MERCADOPAGO_ACCESS_TOKEN=...
//
// Nota: preço fixo por plano abaixo (PLAN_PRICES). Quando o item "diferenciação
// de plano + preço customizado" (valor_customizado em professionals) for
// implementado, este valor precisa ser lido de lá em vez do mapa fixo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;

const PLAN_PRICES: Record<string, number> = { starter: 79, pro: 139, elite: 249 };

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

    const { card_token_id } = await req.json();
    if (!card_token_id) throw new Error('card_token_id é obrigatório.');

    const { data: professional, error: proErr } = await supa
      .from('professionals').select('id, email, plan, mp_preapproval_id').eq('email', user.email).maybeSingle();
    if (proErr || !professional) throw new Error('Profissional não encontrado.');
    if (professional.mp_preapproval_id) throw new Error('Este profissional já tem uma assinatura ativa.');

    const valor = PLAN_PRICES[professional.plan] || PLAN_PRICES.starter;

    const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: `Meu Protocolo — plano ${professional.plan}`,
        external_reference: professional.id,
        payer_email: professional.email,
        card_token_id,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: valor,
          currency_id: 'BRL',
          free_trial: { frequency: 14, frequency_type: 'days' },
        },
        back_url: 'https://meuprotocolo.app/index.html',
        status: 'authorized',
      }),
    });

    const mpData = await mpRes.json();
    if (!mpRes.ok) throw new Error(`Erro ao criar assinatura no Mercado Pago: ${mpData.message || JSON.stringify(mpData)}`);

    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await supaAdmin.from('professionals').update({
      mp_preapproval_id: mpData.id,
      mp_subscription_status: mpData.status,
    }).eq('id', professional.id);

    return jsonResponse({ id: mpData.id, status: mpData.status });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
