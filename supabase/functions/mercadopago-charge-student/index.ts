// O aluno escolhe (ou troca) como paga a mensalidade automática — cartão de
// crédito tokenizado (Secure Fields, mesma técnica de onboarding.html) ou Pix
// avulso. Nível 1 do desenho de cobrança automática (CLAUDE.md).
//
// Cartão: cria a assinatura (preapproval) de verdade AGORA, sob a conta
// conectada do profissional (Authorization: Bearer <access_token do
// professional_mp_connections>), com application_fee de 1% só no plano Pro
// (Elite não paga taxa — narrativa fechada: "o plano de quem está escalando").
//
// Pix avulso: só REGISTRA a escolha do método — o código Pix em si nunca é
// gerado na hora que o aluno escolhe. É o cron diário (billing-cron-daily)
// que gera o Pix avulso 3 dias antes de cada vencimento, automaticamente.
//
// Deploy: supabase functions deploy mercadopago-charge-student

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

// Access token da conta conectada do profissional, renovando via
// refresh_token quando estiver perto de expirar (ou já vencido) — o Mercado
// Pago expira o access_token do OAuth Connect periodicamente, diferente do
// Access Token fixo usado na assinatura do próprio profissional (nível 2).
async function getConnectedAccessToken(supaAdmin: ReturnType<typeof createClient>, professionalId: string): Promise<string> {
  const { data: conn, error } = await supaAdmin
    .from('professional_mp_connections').select('access_token, refresh_token, token_expires_at').eq('professional_id', professionalId).maybeSingle();
  if (error || !conn) throw new Error('Profissional não tem conta Mercado Pago conectada.');

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at as string).getTime() : 0;
  const nearExpiry = expiresAt > 0 && expiresAt - Date.now() < 5 * 60 * 1000;
  if (!nearExpiry || !conn.refresh_token) return conn.access_token as string;

  const refreshRes = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('MERCADOPAGO_CLIENT_ID'),
      client_secret: Deno.env.get('MERCADOPAGO_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
    }),
  });
  const refreshData = await refreshRes.json().catch(() => null);
  if (!refreshRes.ok || !refreshData?.access_token) {
    console.error('Falha ao renovar token OAuth:', JSON.stringify(refreshData));
    return conn.access_token as string; // tenta com o token antigo, melhor que travar
  }
  const newExpiresAt = refreshData.expires_in ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString() : null;
  await supaAdmin.from('professional_mp_connections').update({
    access_token: refreshData.access_token,
    refresh_token: refreshData.refresh_token ?? conn.refresh_token,
    token_expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq('professional_id', professionalId);
  return refreshData.access_token as string;
}

// Mesma fórmula usada em index.html/aluno.html (computeDueInfo) — dia de
// vencimento cadastrado, a partir do último pagamento ou da criação do aluno.
function computeNextDueDate(mensalidadeDia: number, ultimoPagamentoEm: string | null, createdAt: string): Date {
  const base = ultimoPagamentoEm ? new Date(ultimoPagamentoEm + 'T00:00:00') : new Date(createdAt);
  const monthOffset = ultimoPagamentoEm ? 1 : 0;
  return new Date(base.getFullYear(), base.getMonth() + monthOffset, mensalidadeDia);
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

    const { metodo, card_token_id, card_last4, card_expiry } = await req.json();
    if (!['cartao', 'pix_avulso'].includes(metodo)) throw new Error('Método inválido.');
    if (metodo === 'cartao' && !card_token_id) throw new Error('card_token_id é obrigatório para cartão.');

    const { data: student, error: stuErr } = await supa
      .from('students')
      .select('id, email, professional_id, mensalidade_valor, mensalidade_dia_vencimento, ultimo_pagamento_em, created_at, mp_preapproval_id, professionals(id, display_name, plan, mp_connect_status)')
      .eq('email', user.email).maybeSingle();
    if (stuErr || !student) throw new Error('Aluno não encontrado.');

    const professional: any = student.professionals;
    if (!professional || professional.mp_connect_status !== 'conectado') {
      throw new Error('Seu personal ainda não ativou a cobrança automática.');
    }
    // Defesa em profundidade: cobrança automática é exclusiva Pro/Elite,
    // já barrada na origem em mercadopago-oauth-connect/-callback — mas se
    // o profissional baixou pro Starter DEPOIS de já ter conectado a conta
    // (mp_connect_status continua 'conectado', só não tem estudante com
    // automação ativa ainda pra travar o downgrade), essa é a última linha
    // de defesa antes de cobrar de verdade.
    if (professional.plan === 'starter') {
      throw new Error('Seu plano não inclui cobrança automática — fale com o suporte ou faça upgrade pra Pro/Elite.');
    }
    if (!student.mensalidade_valor) throw new Error('Sua mensalidade ainda não foi cadastrada — fale com seu personal.');
    if (!student.mensalidade_dia_vencimento) throw new Error('Seu dia de vencimento ainda não foi cadastrado — fale com seu personal.');

    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Trocar de método (ou reconfigurar o mesmo) sempre cancela a assinatura
    // anterior primeiro — nunca duas cobranças ativas ao mesmo tempo.
    if (student.mp_preapproval_id) {
      try {
        const oldToken = await getConnectedAccessToken(supaAdmin, professional.id);
        await fetch(`https://api.mercadopago.com/preapproval/${student.mp_preapproval_id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${oldToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' }),
        });
      } catch (e) {
        console.error('Falha ao cancelar assinatura anterior do aluno (seguindo mesmo assim):', e);
      }
    }

    if (metodo === 'pix_avulso') {
      await supaAdmin.from('students').update({
        mp_charge_method: 'pix_avulso',
        mp_preapproval_id: null,
        mp_subscription_status: null,
        mp_card_last4: null,
        mp_card_expiry: null,
        pix_pending_payment_id: null,
        pix_pending_qr_base64: null,
        pix_pending_copy_paste: null,
        pix_pending_expires_at: null,
      }).eq('id', student.id);
      return jsonResponse({ metodo: 'pix_avulso' });
    }

    // metodo === 'cartao'
    const accessToken = await getConnectedAccessToken(supaAdmin, professional.id);
    const valor = Number(student.mensalidade_valor);
    const applicationFee = professional.plan === 'pro' ? Math.round(valor * 0.01 * 100) / 100 : 0;
    const nextDue = computeNextDueDate(student.mensalidade_dia_vencimento, student.ultimo_pagamento_em, student.created_at);

    const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: `Mensalidade — ${professional.display_name}`,
        external_reference: student.id,
        payer_email: student.email,
        card_token_id,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: valor,
          currency_id: 'BRL',
          start_date: nextDue.toISOString(),
        },
        back_url: 'https://meuprotocolo.app/aluno.html',
        status: 'authorized',
        ...(applicationFee > 0 ? { application_fee: applicationFee } : {}),
      }),
    });
    const mpBodyText = await mpRes.text();
    let mpData: any = null;
    try { mpData = JSON.parse(mpBodyText); } catch { /* resposta não-JSON, tratado abaixo */ }
    if (!mpRes.ok || !mpData) {
      throw new Error(`Erro ao criar cobrança no Mercado Pago (status ${mpRes.status}): ${mpData?.message || mpBodyText || 'corpo vazio'}`);
    }

    await supaAdmin.from('students').update({
      mp_charge_method: 'cartao',
      mp_preapproval_id: mpData.id,
      mp_subscription_status: mpData.status,
      mp_card_last4: card_last4 || null,
      mp_card_expiry: card_expiry || null,
      pix_pending_payment_id: null,
      pix_pending_qr_base64: null,
      pix_pending_copy_paste: null,
      pix_pending_expires_at: null,
    }).eq('id', student.id);

    return jsonResponse({ metodo: 'cartao', status: mpData.status });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
