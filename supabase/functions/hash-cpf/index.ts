// Calcula e guarda um hash HMAC do CPF do profissional — nunca o CPF em
// texto puro (2026-08-14, item 2 da lista de pendências pós-invasão, ver
// supabase_68_referral_cpf_dedup.sql). Usado só pra detectar indicação em
// anel: duas contas diferentes usando o mesmo CPF real não deveriam gerar
// crédito de indicação uma pra outra.
//
// HMAC com secret (não um hash simples) é proposital: CPF tem baixíssima
// entropia real (~100-200 milhões de combinações válidas) — um hash sem
// chave secreta seria reversível por força bruta trivial (tabela de busca
// reversa computável em minutos) se vazasse do banco. Só a chave secreta
// (CPF_HASH_SECRET, nunca sai do servidor, nunca chega no client) torna o
// valor guardado inofensivo mesmo num vazamento.
//
// O CPF em si nunca é logado, nunca é devolvido, nunca é persistido em
// lugar nenhum — só o hash entra em professionals.cpf_hash.
//
// Deploy: supabase functions deploy hash-cpf
// Secret: CPF_HASH_SECRET (já configurada)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CPF_HASH_SECRET = Deno.env.get('CPF_HASH_SECRET')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autenticado.');

    // Client escopado pelo JWT do profissional — o update abaixo só afeta
    // a própria linha (RLS "professional updates own row" já garante
    // isso), nunca precisa de service role aqui.
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) throw new Error('Sessão inválida.');

    const { cpf } = await req.json().catch(() => ({}));
    // Normaliza (só dígitos) antes de gerar o hash — "111.222.333-44" e
    // "11122233344" precisam bater no mesmo hash pra detectar reuso de
    // verdade, independente de como cada tela formatou o valor.
    const digits = String(cpf || '').replace(/\D/g, '');
    if (digits.length !== 11) throw new Error('CPF inválido.');

    const hash = await hmacHex(CPF_HASH_SECRET, digits);

    const { error } = await supa.from('professionals').update({ cpf_hash: hash }).eq('email', user.email);
    if (error) throw new Error('Falha ao salvar: ' + error.message);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
