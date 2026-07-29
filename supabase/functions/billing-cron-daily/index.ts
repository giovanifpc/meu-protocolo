// Cron único diário: varre alunos com automação ativa e profissionais com
// assinatura ativa, identifica quem está a 3 dias da cobrança, gera o Pix
// avulso automaticamente quando é o caso, dispara e-mail (via
// send-billing-email) + notificação in-app (+ push quando o aluno tiver
// ativado). Idempotente por ciclo — nível 1 usa
// students.last_reminder_sent_for_due, nível 2 usa
// professionals.last_billing_email_sent_for (lacuna 7 do desenho, CLAUDE.md).
//
// Deploy:  supabase functions deploy billing-cron-daily --no-verify-jwt
// Secrets: supabase secrets set CRON_SHARED_SECRET=... (compartilhado com
//   send-billing-email) — chamado só pelo pg_cron via net.http_post, nunca
//   pelo client. Ver supabase_50_automated_billing.sql pro agendamento.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET')!;
const VAPID_KEYS_JSON = Deno.env.get('VAPID_KEYS_JSON');
const MERCADOPAGO_CLIENT_ID = Deno.env.get('MERCADOPAGO_CLIENT_ID');
const MERCADOPAGO_CLIENT_SECRET = Deno.env.get('MERCADOPAGO_CLIENT_SECRET');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function dateOnly(d: Date) { return d.toISOString().slice(0, 10); }

function daysBetween(a: Date, b: Date) {
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((B.getTime() - A.getTime()) / 86400000);
}

// Mesma fórmula de index.html/aluno.html (computeDueInfo).
function computeNextDueDate(mensalidadeDia: number, ultimoPagamentoEm: string | null, createdAt: string): Date {
  const base = ultimoPagamentoEm ? new Date(ultimoPagamentoEm + 'T00:00:00') : new Date(createdAt);
  const monthOffset = ultimoPagamentoEm ? 1 : 0;
  return new Date(base.getFullYear(), base.getMonth() + monthOffset, mensalidadeDia);
}

async function getConnectedAccessToken(supaAdmin: ReturnType<typeof createClient>, professionalId: string): Promise<string | null> {
  const { data: conn } = await supaAdmin
    .from('professional_mp_connections').select('access_token, refresh_token, token_expires_at').eq('professional_id', professionalId).maybeSingle();
  if (!conn) return null;
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at as string).getTime() : 0;
  const nearExpiry = expiresAt > 0 && expiresAt - Date.now() < 5 * 60 * 1000;
  if (!nearExpiry || !conn.refresh_token) return conn.access_token as string;

  const refreshRes = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: MERCADOPAGO_CLIENT_ID,
      client_secret: MERCADOPAGO_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
    }),
  });
  const refreshData = await refreshRes.json().catch(() => null);
  if (!refreshRes.ok || !refreshData?.access_token) return conn.access_token as string;
  const newExpiresAt = refreshData.expires_in ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString() : null;
  await supaAdmin.from('professional_mp_connections').update({
    access_token: refreshData.access_token,
    refresh_token: refreshData.refresh_token ?? conn.refresh_token,
    token_expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq('professional_id', professionalId);
  return refreshData.access_token as string;
}

let appServerPromise: ReturnType<typeof webpush.ApplicationServer.new> | null = null;
function getAppServer() {
  if (!VAPID_KEYS_JSON) return null;
  if (!appServerPromise) {
    appServerPromise = (async () => {
      const vapidKeys = await webpush.importVapidKeys(JSON.parse(VAPID_KEYS_JSON), { extractable: false });
      return webpush.ApplicationServer.new({ contactInformation: 'mailto:contato@meuprotocolo.app', vapidKeys });
    })();
  }
  return appServerPromise;
}

async function sendStudentPush(supaAdmin: ReturnType<typeof createClient>, studentId: string, title: string, body: string) {
  const appServer = await getAppServer();
  if (!appServer) return;
  const { data: subs } = await supaAdmin.from('push_subscriptions').select('*').eq('student_id', studentId);
  if (!subs?.length) return;
  for (const sub of subs) {
    try {
      const subscriber = appServer.subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } });
      await subscriber.pushTextMessage(JSON.stringify({ title, body, url: 'aluno.html' }), {});
    } catch { /* melhor esforço — falha de push não deve travar o resto do cron */ }
  }
}

async function sendEmail(to: string, variant: string, params: any) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-billing-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cron-secret': CRON_SHARED_SECRET },
      body: JSON.stringify({ to, variant, params }),
    });
    if (!res.ok) console.error('Falha ao enviar e-mail de cobrança:', await res.text());
  } catch (e) {
    console.error('Erro ao chamar send-billing-email:', e);
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SHARED_SECRET) {
    return jsonResponse({ error: 'Não autorizado.' }, 401);
  }

  const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const today = new Date();
  const result = { profissionais_avisados: 0, alunos_avisados_cartao: 0, alunos_pix_gerados: 0, erros: [] as string[] };

  try {
    // ===== Nível 2: assinatura do próprio profissional =====
    const { data: professionals } = await supaAdmin
      .from('professionals')
      .select('id, email, display_name, plan, valor_customizado, mp_subscription_status, mp_preapproval_id, ultima_cobranca_em, trial_ends_at, last_billing_email_sent_for')
      .eq('status', 'ativo').eq('billing_exempt', false).eq('mp_subscription_status', 'authorized').not('mp_preapproval_id', 'is', null);

    for (const pro of professionals || []) {
      try {
        let nextCharge: Date | null = null;
        if (pro.ultima_cobranca_em) {
          const last = new Date(pro.ultima_cobranca_em);
          nextCharge = new Date(last.getFullYear(), last.getMonth() + 1, last.getDate());
        } else if (pro.trial_ends_at) {
          nextCharge = new Date(pro.trial_ends_at);
        }
        if (!nextCharge) continue;

        const due = dateOnly(nextCharge);
        if (daysBetween(today, nextCharge) !== 3) continue;
        if (pro.last_billing_email_sent_for === due) continue;

        const valor = pro.valor_customizado ?? ({ starter: 79, pro: 139, elite: 249 } as any)[pro.plan] ?? 79;
        await sendEmail(pro.email, 'cartao_aviso', { nome: pro.display_name, valor, contexto: 'profissional' });
        await supaAdmin.from('professional_notifications').insert({
          professional_id: pro.id,
          title: 'Assinatura será cobrada em 3 dias',
          body: `R$ ${Number(valor).toFixed(2)} no cartão cadastrado.`,
        });
        await supaAdmin.from('professionals').update({ last_billing_email_sent_for: due }).eq('id', pro.id);
        result.profissionais_avisados++;
      } catch (e) {
        result.erros.push(`profissional ${pro.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ===== Nível 1: mensalidade dos alunos =====
    const { data: students } = await supaAdmin
      .from('students')
      .select('id, email, nome, professional_id, mensalidade_valor, mensalidade_dia_vencimento, ultimo_pagamento_em, created_at, mp_charge_method, last_reminder_sent_for_due, professionals(id, display_name, plan, mp_connect_status)')
      .in('mp_charge_method', ['cartao', 'pix_avulso'])
      .not('mensalidade_dia_vencimento', 'is', null)
      .not('mensalidade_valor', 'is', null);

    for (const s of students || []) {
      try {
        const professional: any = s.professionals;
        if (!professional || professional.mp_connect_status !== 'conectado') continue;
        // Defesa em profundidade: cobrança automática é exclusiva Pro/Elite
        // (barrada na origem em mercadopago-oauth-connect/-callback/-charge-
        // student) — se algum dado antigo escapou dessa trava, o cron nunca
        // deve continuar cobrando/lembrando um aluno de profissional Starter.
        if (professional.plan === 'starter') continue;

        const due = computeNextDueDate(s.mensalidade_dia_vencimento, s.ultimo_pagamento_em, s.created_at);
        if (daysBetween(today, due) !== 3) continue;
        const dueStr = dateOnly(due);
        if (s.last_reminder_sent_for_due === dueStr) continue;

        const valor = Number(s.mensalidade_valor);

        if (s.mp_charge_method === 'cartao') {
          await sendEmail(s.email, 'cartao_aviso', { nome: s.nome, valor, contexto: 'aluno', nomeProfissional: professional.display_name });
          await supaAdmin.from('student_notifications').insert({
            student_id: s.id,
            title: 'Cobrança em 3 dias',
            body: `R$ ${valor.toFixed(2)} no seu cartão cadastrado.`,
          });
          await sendStudentPush(supaAdmin, s.id, 'Cobrança em 3 dias', `R$ ${valor.toFixed(2)} no seu cartão cadastrado.`);
          result.alunos_avisados_cartao++;
        } else {
          // pix_avulso: gera o Pix agora, sob a conta conectada do profissional.
          const accessToken = await getConnectedAccessToken(supaAdmin, professional.id);
          if (!accessToken) continue;
          const applicationFee = professional.plan === 'pro' ? Math.round(valor * 0.01 * 100) / 100 : 0;

          const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({
              transaction_amount: valor,
              description: `Mensalidade — ${professional.display_name}`,
              payment_method_id: 'pix',
              payer: { email: s.email },
              external_reference: s.id,
              ...(applicationFee > 0 ? { application_fee: applicationFee } : {}),
            }),
          });
          const mpData = await mpRes.json().catch(() => null);
          if (!mpRes.ok || !mpData?.point_of_interaction?.transaction_data) {
            result.erros.push(`pix aluno ${s.id}: ${JSON.stringify(mpData)}`);
            continue;
          }
          const txData = mpData.point_of_interaction.transaction_data;
          await supaAdmin.from('students').update({
            pix_pending_payment_id: String(mpData.id),
            pix_pending_qr_base64: txData.qr_code_base64 || null,
            pix_pending_copy_paste: txData.qr_code || null,
            pix_pending_expires_at: mpData.date_of_expiration || null,
          }).eq('id', s.id);

          await sendEmail(s.email, 'pix_pronto', {
            nome: s.nome, valor, nomeProfissional: professional.display_name,
            qrBase64: txData.qr_code_base64, copiaCola: txData.qr_code,
          });
          await supaAdmin.from('student_notifications').insert({
            student_id: s.id,
            title: 'Seu Pix está pronto',
            body: `R$ ${valor.toFixed(2)} — confira o e-mail ou a aba Financeiro.`,
          });
          await sendStudentPush(supaAdmin, s.id, 'Seu Pix está pronto', `R$ ${valor.toFixed(2)} — confira a aba Financeiro.`);
          result.alunos_pix_gerados++;
        }

        await supaAdmin.from('students').update({ last_reminder_sent_for_due: dueStr }).eq('id', s.id);
      } catch (e) {
        result.erros.push(`aluno ${s.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    console.error('Erro no billing-cron-daily:', err);
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : String(err), ...result }, 500);
  }
});
