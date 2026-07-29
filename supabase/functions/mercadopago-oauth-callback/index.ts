// Recebe o redirect de volta da Mercado Pago depois do profissional autorizar
// a conexão (nível 1). Sem JWT do Supabase (é a Mercado Pago redirecionando o
// navegador, não uma chamada autenticada) — a segurança aqui é o `state`
// (nonce de curta duração criado por mercadopago-oauth-connect).
//
// Deploy:   supabase functions deploy mercadopago-oauth-callback --no-verify-jwt
// Secrets:  supabase secrets set MERCADOPAGO_CLIENT_ID=... MERCADOPAGO_CLIENT_SECRET=... MERCADOPAGO_REDIRECT_URI=...
//
// Depois do deploy, cadastrar a URL desta function como "URL de redirect" na
// aplicação do Mercado Pago (painel de desenvolvedores → sua aplicação →
// OAuth/Redirect URIs).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MERCADOPAGO_CLIENT_ID = Deno.env.get('MERCADOPAGO_CLIENT_ID')!;
const MERCADOPAGO_CLIENT_SECRET = Deno.env.get('MERCADOPAGO_CLIENT_SECRET')!;
const MERCADOPAGO_REDIRECT_URI = Deno.env.get('MERCADOPAGO_REDIRECT_URI')!;

const FINANCEIRO_URL = 'https://meuprotocolo.app/financeiro.html';

function redirect(query: string) {
  return new Response(null, { status: 302, headers: { Location: `${FINANCEIRO_URL}?${query}` } });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return redirect('mp_connect=erro&motivo=parametros_ausentes');

    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: stateRow, error: stateErr } = await supaAdmin
      .from('mp_oauth_states').select('professional_id, created_at').eq('state', state).maybeSingle();
    if (stateErr || !stateRow) return redirect('mp_connect=erro&motivo=state_invalido');

    const ageMs = Date.now() - new Date(stateRow.created_at).getTime();
    if (ageMs > 10 * 60 * 1000) {
      await supaAdmin.from('mp_oauth_states').delete().eq('state', state);
      return redirect('mp_connect=erro&motivo=expirado');
    }

    // Defesa em profundidade: mercadopago-oauth-connect já barra Starter na
    // origem, mas o plano pode ter mudado entre gerar o link e voltar da
    // Mercado Pago (ex: downgrade no meio do fluxo) — reconfere antes de
    // finalizar a conexão, nunca confia só na checagem de quando o link foi
    // criado.
    const { data: proCheck } = await supaAdmin
      .from('professionals').select('plan').eq('id', stateRow.professional_id).maybeSingle();
    if (proCheck?.plan === 'starter') {
      await supaAdmin.from('mp_oauth_states').delete().eq('state', state);
      return redirect('mp_connect=erro&motivo=plano_starter');
    }

    const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: MERCADOPAGO_CLIENT_ID,
        client_secret: MERCADOPAGO_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: MERCADOPAGO_REDIRECT_URI,
      }),
    });
    const tokenBodyText = await tokenRes.text();
    let tokenData: any = null;
    try { tokenData = JSON.parse(tokenBodyText); } catch { /* resposta não-JSON, tratado abaixo */ }
    if (!tokenRes.ok || !tokenData?.access_token) {
      console.error('Falha ao trocar code por token:', tokenBodyText);
      await supaAdmin.from('mp_oauth_states').delete().eq('state', state);
      return redirect('mp_connect=erro&motivo=token_invalido');
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    await supaAdmin.from('professional_mp_connections').upsert({
      professional_id: stateRow.professional_id,
      mp_user_id: String(tokenData.user_id ?? ''),
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'professional_id' });

    await supaAdmin.from('professionals').update({ mp_connect_status: 'conectado' }).eq('id', stateRow.professional_id);
    await supaAdmin.from('mp_oauth_states').delete().eq('state', state);

    return redirect('mp_connect=ok');
  } catch (err) {
    console.error('Erro no callback OAuth do Mercado Pago:', err);
    return redirect('mp_connect=erro&motivo=interno');
  }
});
