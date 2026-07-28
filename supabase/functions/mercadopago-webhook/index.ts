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
      const externalRef = preapproval.external_reference;
      if (externalRef) {
        const { data: proMatch } = await supaAdmin.from('professionals').select('id').eq('id', externalRef).maybeSingle();

        if (proMatch) {
          // Nível 2: assinatura do próprio profissional (comportamento já
          // existente, inalterado).
          const professionalId = proMatch.id;
          const novoStatus = preapproval.status === 'authorized' ? 'ativo'
            : (preapproval.status === 'paused' || preapproval.status === 'cancelled') ? 'inativo'
            : undefined;
          await supaAdmin.from('professionals').update({
            mp_subscription_status: preapproval.status,
            ...(novoStatus ? { status: novoStatus } : {}),
            ...(novoStatus === 'inativo' ? { inactive_since: new Date().toISOString() } : {}),
          }).eq('id', professionalId);
          await supaAdmin.from('billing_events').update({ professional_id: professionalId }).eq('mp_id', dataId).eq('mp_type', tipo);
        } else {
          // Nível 1: mensalidade automática do aluno (cartão) — só espelha o
          // status; quem decide bloquear acesso do aluno continua sendo o
          // profissional manualmente (mesma regra já fechada no desenho:
          // falha de cobrança nunca bloqueia acesso sozinha).
          const { data: stuMatch } = await supaAdmin.from('students').select('id, professional_id').eq('id', externalRef).maybeSingle();
          if (stuMatch) {
            await supaAdmin.from('students').update({ mp_subscription_status: preapproval.status }).eq('id', stuMatch.id);
            await supaAdmin.from('billing_events').update({ professional_id: stuMatch.professional_id }).eq('mp_id', dataId).eq('mp_type', tipo);
          }
        }
      }
    } else if (tipo === 'payment') {
      const payment = await mpFetch(`/v1/payments/${dataId}`);
      const externalRef = payment.external_reference;

      const { data: proMatch } = externalRef
        ? await supaAdmin.from('professionals').select('id').eq('id', externalRef).maybeSingle()
        : { data: null };

      if (!proMatch && externalRef) {
        // Nível 1: cobrança automática do aluno (cartão recorrente ou Pix
        // avulso gerado pelo cron) — grava no ledger e atualiza o estado do
        // aluno. Nunca confundir com a cobrança da assinatura do profissional
        // tratada no bloco abaixo.
        const { data: stuMatch } = await supaAdmin.from('students')
          .select('id, professional_id, dunning_attempts, mp_charge_method').eq('id', externalRef).maybeSingle();
        if (stuMatch) {
          const taxaRetida = Array.isArray(payment.fee_details)
            ? payment.fee_details.filter((f: any) => f.type === 'application_fee').reduce((acc: number, f: any) => acc + (f.amount || 0), 0)
            : 0;
          const valor = Number(payment.transaction_amount || 0);
          const metodo = payment.payment_method_id === 'pix' ? 'pix_avulso' : 'cartao';

          await supaAdmin.from('student_billing_charges').upsert({
            student_id: stuMatch.id,
            professional_id: stuMatch.professional_id,
            metodo,
            mp_payment_id: dataId,
            status: payment.status,
            valor,
            taxa_retida: taxaRetida,
            valor_liquido: valor - taxaRetida,
            motivo_falha: payment.status === 'rejected' ? (payment.status_detail || null) : null,
            paid_at: payment.status === 'approved' ? new Date().toISOString() : null,
          }, { onConflict: 'student_id,mp_payment_id' });

          if (payment.status === 'approved') {
            await supaAdmin.from('students').update({
              ultimo_pagamento_em: new Date().toISOString().slice(0, 10),
              dunning_attempts: 0,
              ...(metodo === 'pix_avulso' ? { pix_pending_payment_id: null, pix_pending_qr_base64: null, pix_pending_copy_paste: null, pix_pending_expires_at: null } : {}),
            }).eq('id', stuMatch.id);
          } else if (payment.status === 'rejected' && metodo === 'cartao') {
            const attempts = (stuMatch.dunning_attempts || 0) + 1;
            await supaAdmin.from('students').update({ dunning_attempts: attempts }).eq('id', stuMatch.id);
            // 2-3 tentativas (o próprio Mercado Pago já reprocessa a cobrança
            // recorrente sozinho em dias alternados) — só na exceção o
            // profissional é avisado, nunca a cada tentativa isolada.
            if (attempts >= 3) {
              const { data: stuFull } = await supaAdmin.from('students').select('nome').eq('id', stuMatch.id).maybeSingle();
              await supaAdmin.from('professional_notifications').insert({
                professional_id: stuMatch.professional_id,
                title: 'Falha na cobrança automática',
                body: `${stuFull?.nome || 'Um aluno'} teve ${attempts} tentativas de cobrança recusadas — considere falar com ele(a).`,
              });
            }
          }
        }
        await supaAdmin.from('billing_events').update({ professional_id: null }).eq('mp_id', dataId).eq('mp_type', tipo);
        return jsonResponse({ ok: true });
      }

      const professionalId = externalRef;
      if (proMatch && professionalId) {
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
