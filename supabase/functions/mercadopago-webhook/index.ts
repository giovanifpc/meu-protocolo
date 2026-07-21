// Recebe as notificações webhook do Mercado Pago (assinatura/preapproval do
// profissional). Nunca confia no corpo da notificação pra decidir status —
// o Mercado Pago recomenda buscar o recurso de novo pela API usando o id
// recebido, então é isso que fazemos antes de atualizar qualquer coisa.
//
// Deploy:   supabase functions deploy mercadopago-webhook --no-verify-jwt
//   (--no-verify-jwt é obrigatório: o Mercado Pago não manda JWT do Supabase,
//   só o header x-signature próprio dele, validado manualmente abaixo)
// Secrets:  supabase secrets set MERCADOPAGO_ACCESS_TOKEN=... MERCADOPAGO_WEBHOOK_SECRET=...
//
// Depois do deploy, configurar a URL desta função como webhook na aplicação
// do Mercado Pago (painel de desenvolvedores → sua aplicação → Webhooks) e
// colar a "chave secreta" gerada lá como MERCADOPAGO_WEBHOOK_SECRET.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;
const MERCADOPAGO_WEBHOOK_SECRET = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Formato do header x-signature: "ts=1704908010,v1=618c8534...". O manifest
// assinado é "id:{data.id};request-id:{x-request-id};ts:{ts};" — id em
// minúsculo, exatamente como documentado pelo Mercado Pago.
async function verificaAssinatura(req: Request, dataId: string): Promise<boolean> {
  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id') || '';
  if (!xSignature) return false;

  const parts = Object.fromEntries(
    xSignature.split(',').map((p) => p.trim().split('=').map((s) => s.trim())),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
  const esperado = await hmacSha256Hex(MERCADOPAGO_WEBHOOK_SECRET, manifest);
  return esperado === v1;
}

async function mpFetch(path: string) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    headers: {
      Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      // mesmo caso do X-scope em mercadopago-create-preapproval: com token de
      // teste, recursos criados em modo teste só são achados no ambiente stage
      ...(MERCADOPAGO_ACCESS_TOKEN.startsWith('TEST-') ? { 'X-scope': 'stage' } : {}),
    },
  });
  if (!res.ok) throw new Error(`Mercado Pago API ${path} respondeu ${res.status}: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ ok: true });

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    const tipo: string = body.type || body.topic || url.searchParams.get('type') || url.searchParams.get('topic') || '';
    const dataId: string = body.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id') || '';
    if (!tipo || !dataId) return jsonResponse({ ok: true }); // notificação que não reconhecemos — apenas confirma recebimento

    const assinaturaValida = await verificaAssinatura(req, dataId);
    if (!assinaturaValida) return jsonResponse({ error: 'assinatura inválida' }, 401);

    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // idempotência: se já processamos esse (mp_id, mp_type), confirma sem reprocessar
    const { error: insertErr } = await supaAdmin
      .from('billing_events')
      .insert({ mp_id: dataId, mp_type: tipo, payload: body });
    if (insertErr) {
      if (insertErr.code === '23505') return jsonResponse({ ok: true, duplicado: true });
      throw new Error('Falha ao registrar evento de billing: ' + insertErr.message);
    }

    if (tipo === 'preapproval' || tipo === 'subscription_preapproval') {
      const preapproval = await mpFetch(`/preapproval/${dataId}`);
      const professionalId = preapproval.external_reference;
      if (professionalId) {
        const novoStatus = preapproval.status === 'authorized' ? 'ativo'
          : (preapproval.status === 'paused' || preapproval.status === 'cancelled') ? 'inativo'
          : undefined;
        await supaAdmin.from('professionals').update({
          mp_subscription_status: preapproval.status,
          ...(novoStatus ? { status: novoStatus } : {}),
          ...(novoStatus === 'inativo' ? { inactive_since: new Date().toISOString() } : {}),
        }).eq('id', professionalId);
        await supaAdmin.from('billing_events').update({ professional_id: professionalId }).eq('mp_id', dataId).eq('mp_type', tipo);
      }
    } else if (tipo === 'payment') {
      const payment = await mpFetch(`/v1/payments/${dataId}`);
      const professionalId = payment.external_reference;
      if (professionalId) {
        // Lido ANTES de atualizar ultima_cobranca_em — é o jeito de saber se
        // essa é a 1ª cobrança aprovada desse profissional (dispara a
        // recompensa de indicação) sem precisar de uma coluna extra só pra
        // isso.
        const { data: proBefore } = await supaAdmin
          .from('professionals')
          .select('ultima_cobranca_em, referral_credit_months')
          .eq('id', professionalId)
          .maybeSingle();
        const eraPrimeiraCobranca = !!proBefore && !proBefore.ultima_cobranca_em;

        await supaAdmin.from('professionals').update({
          ultima_cobranca_status: payment.status,
          ultima_cobranca_em: new Date().toISOString(),
          ...(payment.status === 'approved' ? { status: 'ativo' } : {}),
        }).eq('id', professionalId);
        await supaAdmin.from('billing_events').update({ professional_id: professionalId }).eq('mp_id', dataId).eq('mp_type', tipo);

        if (payment.status === 'approved') {
          // Programa de indicação (item 16) — só quem indica é recompensado.
          // 1) Se esse profissional foi indicado por alguém e essa é a
          //    primeira cobrança aprovada dele de verdade (não só cadastro),
          //    credita 1 mês grátis pra quem indicou.
          if (eraPrimeiraCobranca) {
            const { data: referral } = await supaAdmin
              .from('referrals')
              .select('id, referrer_id')
              .eq('referred_id', professionalId)
              .is('rewarded_at', null)
              .maybeSingle();
            if (referral) {
              await supaAdmin.rpc('increment_referral_credit', { p_professional_id: referral.referrer_id });
              await supaAdmin.from('referrals').update({ rewarded_at: new Date().toISOString() }).eq('id', referral.id);
            }
          }

          // 2) Se ESSE profissional (quem acabou de pagar) tem crédito de
          //    indicação pendente, estorna a cobrança que acabou de ser
          //    aprovada e consome 1 crédito — é assim que "1 mês grátis" é
          //    aplicado de fato, sem precisar prever data de cobrança nem
          //    zerar/reverter o valor da assinatura.
          if (proBefore && (proBefore.referral_credit_months ?? 0) > 0) {
            const refundRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}/refunds`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`, 'content-type': 'application/json' },
            });
            if (refundRes.ok) {
              await supaAdmin.rpc('decrement_referral_credit', { p_professional_id: professionalId });
            } else {
              console.error('Falha ao estornar cobrança de indicação:', await refundRes.text());
            }
          }
        }
      }
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('Erro no webhook do Mercado Pago:', err);
    // sempre 200 pra evitar retry storm em erro nosso (ex: falha transitória
    // na API do Mercado Pago) — o próprio Mercado Pago já reenvia notificações
    // periodicamente por um tempo, então um erro isolado se autocorrige.
    return jsonResponse({ ok: true });
  }
});
