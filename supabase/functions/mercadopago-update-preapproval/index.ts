// Sincroniza o valor cobrado no Mercado Pago quando o profissional troca de
// plano pelo próprio painel (upgrade self-service, perfil.html) — sem isso,
// trocar o plano só mudava o que o app libera (gating), mas a assinatura já
// criada continuava cobrando o valor antigo pra sempre.
//
// Deploy:   supabase functions deploy mercadopago-update-preapproval
// Secret:   supabase secrets set MERCADOPAGO_ACCESS_TOKEN=... (já existe)
//
// Chamada por perfil.html. Se o profissional ainda não tem assinatura
// criada no Mercado Pago (ex: conta billing_exempt sem cartão cadastrado),
// só atualiza o plano localmente — não há cobrança pra sincronizar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;

const PLAN_PRICES: Record<string, number> = { starter: 79, pro: 139, elite: 249 };
const PLAN_STUDENT_LIMITS: Record<string, number> = { starter: 15, pro: 40, elite: Infinity };

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

    const { plan: newPlan } = await req.json();
    if (!['starter', 'pro', 'elite'].includes(newPlan)) throw new Error('Plano inválido.');

    const { data: professional, error: proErr } = await supa
      .from('professionals')
      .select('id, plan, valor_customizado, mp_preapproval_id')
      .eq('email', user.email)
      .maybeSingle();
    if (proErr || !professional) throw new Error('Profissional não encontrado.');

    if (professional.plan === newPlan) {
      return jsonResponse({ plan: newPlan, synced: false, unchanged: true });
    }

    // Downgrade não pode deixar o profissional acima do limite de alunos do
    // plano novo — barrado aqui (servidor), não só escondido no front.
    const limite = PLAN_STUDENT_LIMITS[newPlan];
    if (limite !== Infinity) {
      const { count, error: countErr } = await supa
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', professional.id);
      if (countErr) throw new Error('Erro ao checar número de alunos: ' + countErr.message);
      if ((count ?? 0) > limite) {
        throw new Error(`Você tem ${count} alunos cadastrados — o plano ${newPlan} permite até ${limite}. Remova ou pause alunos antes de trocar de plano.`);
      }
    }

    const valor = professional.valor_customizado ?? PLAN_PRICES[newPlan];
    let synced = false;

    if (professional.mp_preapproval_id) {
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${professional.mp_preapproval_id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ auto_recurring: { transaction_amount: valor } }),
      });
      const mpBodyText = await mpRes.text();
      let mpData: any = null;
      try { mpData = JSON.parse(mpBodyText); } catch { /* resposta não-JSON, tratado abaixo */ }
      if (!mpRes.ok) {
        throw new Error(`Erro ao atualizar assinatura no Mercado Pago (status ${mpRes.status}): ${mpData?.message || mpBodyText || 'corpo vazio'}`);
      }
      synced = true;
    }

    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: updErr } = await supaAdmin.from('professionals').update({ plan: newPlan }).eq('id', professional.id);
    if (updErr) throw new Error('Assinatura sincronizada, mas falhou ao salvar o plano novo: ' + updErr.message);

    return jsonResponse({ plan: newPlan, valor, synced });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
