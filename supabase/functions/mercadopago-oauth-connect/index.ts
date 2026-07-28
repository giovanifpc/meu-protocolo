// Gera a URL de autorização OAuth do Mercado Pago pro profissional conectar
// a própria conta (nível 1 — cobrança automática dos alunos). Chamada por
// financeiro.html; o front só faz window.location.href = url retornada.
//
// Deploy:   supabase functions deploy mercadopago-oauth-connect
// Secrets:  supabase secrets set MERCADOPAGO_CLIENT_ID=... MERCADOPAGO_REDIRECT_URI=...
//   (MERCADOPAGO_CLIENT_ID é o "Client ID" da aplicação, painel de
//   desenvolvedores → sua aplicação → Credenciais de produção — diferente do
//   Access Token/Public Key já configurados. MERCADOPAGO_REDIRECT_URI é a URL
//   pública desta function depois do deploy, ex:
//   https://yumqmramxbahkfxsthtt.supabase.co/functions/v1/mercadopago-oauth-callback
//   — precisa bater exatamente com o que foi cadastrado no painel do MP em
//   "URLs de redirecionamento" da aplicação.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MERCADOPAGO_CLIENT_ID = Deno.env.get('MERCADOPAGO_CLIENT_ID')!;
const MERCADOPAGO_REDIRECT_URI = Deno.env.get('MERCADOPAGO_REDIRECT_URI')!;

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

    const state = crypto.randomUUID();
    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // Limpa states antigos (>10min) desse profissional antes de criar um novo
    // — evita acumular lixo de tentativas abandonadas.
    await supaAdmin.from('mp_oauth_states').delete().eq('professional_id', professional.id);
    const { error: insErr } = await supaAdmin.from('mp_oauth_states').insert({ state, professional_id: professional.id });
    if (insErr) throw new Error('Falha ao iniciar conexão: ' + insErr.message);

    const url = new URL('https://auth.mercadopago.com.br/authorization');
    url.searchParams.set('client_id', MERCADOPAGO_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('platform_id', 'mp');
    url.searchParams.set('state', state);
    url.searchParams.set('redirect_uri', MERCADOPAGO_REDIRECT_URI);

    return jsonResponse({ url: url.toString() });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
