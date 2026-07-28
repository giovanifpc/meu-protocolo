// Desconecta a conta Mercado Pago do profissional (nível 1) — lacuna 1 do
// desenho fechado em 2026-07-28 (CLAUDE.md): sem isso, não existia caminho de
// volta pro "Conectar". Antes de apagar a conexão, cancela (melhor esforço)
// os preapprovals de cartão dos alunos ainda ativos — sem conta conectada não
// há como continuar cobrando, e o desenho manda a cobrança "simplesmente
// parar" (o Pix estático antigo reaparece sozinho, já que nunca foi apagado).
//
// Deploy:   supabase functions deploy mercadopago-oauth-disconnect

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
    if (!user) throw new Error('Sessão inválida.');

    const { data: professional, error: proErr } = await supa
      .from('professionals').select('id').eq('email', user.email).maybeSingle();
    if (proErr || !professional) throw new Error('Profissional não encontrado.');

    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: connection } = await supaAdmin
      .from('professional_mp_connections').select('access_token').eq('professional_id', professional.id).maybeSingle();

    const { data: activeCardStudents } = await supaAdmin
      .from('students')
      .select('id, mp_preapproval_id')
      .eq('professional_id', professional.id)
      .eq('mp_charge_method', 'cartao')
      .not('mp_preapproval_id', 'is', null);

    let canceledCount = 0;
    let failedCount = 0;
    if (connection?.access_token && activeCardStudents?.length) {
      for (const s of activeCardStudents) {
        try {
          const res = await fetch(`https://api.mercadopago.com/preapproval/${s.mp_preapproval_id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${connection.access_token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'cancelled' }),
          });
          if (res.ok) canceledCount++; else failedCount++;
        } catch {
          failedCount++;
        }
      }
    }

    // Reseta o método de cobrança de todos os alunos com automação (cartão
    // ou Pix avulso) desse profissional — sem conta conectada, nenhum dos
    // dois pode continuar. O Pix estático (pix_key_text/QR) nunca foi
    // apagado, então reaparece sozinho na tela do aluno assim que
    // mp_connect_status deixa de ser 'conectado'.
    await supaAdmin.from('students').update({
      mp_charge_method: 'nenhum',
      mp_preapproval_id: null,
      mp_subscription_status: null,
      mp_card_last4: null,
      mp_card_expiry: null,
      pix_pending_payment_id: null,
      pix_pending_qr_base64: null,
      pix_pending_copy_paste: null,
      pix_pending_expires_at: null,
    }).eq('professional_id', professional.id).neq('mp_charge_method', 'nenhum');

    await supaAdmin.from('professional_mp_connections').delete().eq('professional_id', professional.id);
    await supaAdmin.from('professionals').update({ mp_connect_status: 'revogado' }).eq('id', professional.id);

    return jsonResponse({ disconnected: true, canceledCount, failedCount });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
