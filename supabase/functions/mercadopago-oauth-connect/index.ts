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

const ALLOWED_ORIGINS = new Set(['https://meuprotocolo.app', 'https://giovanifpc.github.io']);

// Calcula os headers de CORS por requisição, escopando Access-Control-Allow-Origin
// a essa allowlist em vez de '*' (2026-08-20, mapeado contra uma lista de
// achados de pentest genéricos) — reforço de defesa em profundidade, a
// segurança real continua sendo o JWT/RLS de cada function, CORS nunca foi a
// fronteira de verdade aqui. Precisa ser calculado por requisição (nunca um
// `let` de módulo) porque o valor depende do Origin de quem chamou — uma
// variável compartilhada entre requisições concorrentes no mesmo isolate
// Deno seria uma condição de corrida real (uma resposta poderia devolver o
// Origin de outra requisição concorrente).
function corsHeadersFor(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://meuprotocolo.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }

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
      .from('professionals').select('id, plan').eq('email', user.email).maybeSingle();
    if (proErr || !professional) throw new Error('Profissional não encontrado.');

    // Cobrança automática dos alunos é exclusiva Pro/Elite (mesma lógica do
    // white-label) — barrado aqui no servidor, não só escondido no front
    // (financeiro.html já esconde o botão pro Starter, isso é a garantia real).
    if (professional.plan === 'starter') {
      throw new Error('Cobrança automática é exclusiva dos planos Pro e Elite. Faça upgrade em Perfil > Seu plano.');
    }

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
