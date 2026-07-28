// Sincroniza mensalidade_valor de um aluno com a cobrança recorrente já
// ativa no Mercado Pago (lacuna 4 do desenho de cobrança automática,
// CLAUDE.md) — sem isso, mudar o preço na tela não muda o valor já
// configurado na assinatura do aluno. Chamada por alunos.html logo depois de
// salvar um mensalidade_valor novo pra um aluno com mp_charge_method='cartao'.
//
// Deploy: supabase functions deploy mercadopago-update-student-charge

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
    return conn.access_token as string;
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

    const { student_id, novo_valor } = await req.json();
    if (!student_id || typeof novo_valor !== 'number' || novo_valor <= 0) throw new Error('Parâmetros inválidos.');

    const { data: professional, error: proErr } = await supa
      .from('professionals').select('id').eq('email', user.email).maybeSingle();
    if (proErr || !professional) throw new Error('Profissional não encontrado.');

    // RLS de students ("professional manages own students") já garante que
    // essa select só retorna o aluno se ele pertencer a este profissional —
    // se vier vazio, ou o aluno não existe ou não é dele.
    const { data: student, error: stuErr } = await supa
      .from('students').select('id, mp_charge_method, mp_preapproval_id, professional_id').eq('id', student_id).maybeSingle();
    if (stuErr || !student) throw new Error('Aluno não encontrado.');

    if (student.mp_charge_method !== 'cartao' || !student.mp_preapproval_id) {
      return jsonResponse({ synced: false, reason: 'aluno não tem cartão automático ativo' });
    }

    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const accessToken = await getConnectedAccessToken(supaAdmin, professional.id);

    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${student.mp_preapproval_id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ auto_recurring: { transaction_amount: novo_valor } }),
    });
    const mpBodyText = await mpRes.text();
    let mpData: any = null;
    try { mpData = JSON.parse(mpBodyText); } catch { /* resposta não-JSON, tratado abaixo */ }
    if (!mpRes.ok) {
      throw new Error(`Erro ao sincronizar valor no Mercado Pago (status ${mpRes.status}): ${mpData?.message || mpBodyText || 'corpo vazio'}`);
    }

    return jsonResponse({ synced: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
