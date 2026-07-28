// Troca o cartão da PRÓPRIA assinatura do profissional (nível 2, "Cartão da
// assinatura" em perfil.html) — antes não existia nenhuma tela pra isso, só
// dava pra trocar de plano. Usa a mesma conta MP fixa do projeto (Access
// Token), nunca uma conta conectada — diferente do nível 1 (aluno).
//
// PUT /preapproval/{id} aceita trocar card_token_id de uma assinatura ativa
// diretamente (confirmado na doc do Mercado Pago) — não precisa cancelar e
// recriar o preapproval.
//
// Deploy: supabase functions deploy mercadopago-update-card

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

    const { card_token_id } = await req.json();
    if (!card_token_id) throw new Error('card_token_id é obrigatório.');

    const { data: professional, error: proErr } = await supa
      .from('professionals').select('id, mp_preapproval_id').eq('email', user.email).maybeSingle();
    if (proErr || !professional) throw new Error('Profissional não encontrado.');
    if (!professional.mp_preapproval_id) throw new Error('Você ainda não tem uma assinatura ativa pra trocar o cartão.');

    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${professional.mp_preapproval_id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ card_token_id }),
    });
    const mpBodyText = await mpRes.text();
    let mpData: any = null;
    try { mpData = JSON.parse(mpBodyText); } catch { /* resposta não-JSON, tratado abaixo */ }
    if (!mpRes.ok) {
      throw new Error(`Erro ao trocar cartão no Mercado Pago (status ${mpRes.status}): ${mpData?.message || mpBodyText || 'corpo vazio'}`);
    }

    return jsonResponse({ updated: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
