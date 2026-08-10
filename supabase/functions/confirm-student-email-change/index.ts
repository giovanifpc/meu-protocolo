// Passo 2 do fluxo de troca de e-mail do aluno — o aluno clica no link
// mandado pro e-mail NOVO (confirmar-email.html?token=...), essa function
// valida o token e só AÍ troca de verdade: auth.users via Admin API e
// students.email, nessa ordem ("externo primeiro, local depois", mesmo
// princípio já usado no cancelamento de assinatura, mercadopago-cancel-
// preapproval) — nunca deixa students.email mudar sem o Auth já ter
// mudado junto (a RLS de quase toda tabela de aluno depende desse match).
//
// Sem verify_jwt — o aluno pode nem ter sessão aberta nesse momento
// (dispositivo novo, ou nem instalou o app ainda), o token da URL é a
// única credencial que importa aqui.
//
// Deploy:   supabase functions deploy confirm-student-email-change --no-verify-jwt
// Secret:   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... (já existe)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

async function sha256Hex(text: string) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token || typeof token !== 'string') throw new Error('Link inválido.');

    const tokenHash = await sha256Hex(token);
    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: reqRow, error: reqErr } = await supaAdmin
      .from('student_email_change_requests')
      .select('id, student_id, new_email, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (reqErr) throw new Error('Erro ao validar o link: ' + reqErr.message);
    if (!reqRow) throw new Error('Link inválido ou já utilizado.');
    if (reqRow.used_at) throw new Error('Esse link já foi usado.');
    if (new Date(reqRow.expires_at).getTime() < Date.now()) throw new Error('Esse link expirou — peça pro seu personal gerar um novo.');

    const { data: student, error: studentErr } = await supaAdmin
      .from('students').select('id, email').eq('id', reqRow.student_id).maybeSingle();
    if (studentErr || !student) throw new Error('Aluno não encontrado.');

    // auth.admin não tem "getUserByEmail" direto, só getUserById — resolve
    // o auth.users.id a partir do e-mail ATUAL do aluno varrendo a lista
    // de usuários. Escala pequena hoje (mesmo raciocínio de simplicidade
    // já usado em outras partes do projeto — não vale infraestrutura nova,
    // tipo função SQL própria pra ler auth.users, pra um volume de usuários
    // que ainda nem existe).
    let authUserId: string | null = null;
    let page = 1;
    while (!authUserId) {
      const { data: listData, error: listErr } = await supaAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) throw new Error('Erro ao localizar a conta do aluno: ' + listErr.message);
      const match = (listData?.users || []).find((u) => (u.email || '').toLowerCase() === student.email.toLowerCase());
      if (match) { authUserId = match.id; break; }
      if (!listData?.users || listData.users.length < 200) break; // acabou a lista, não achou
      page++;
    }
    if (!authUserId) throw new Error('Conta de autenticação do aluno não encontrada.');

    // Garantia extra, achada testando de verdade (2026-08-10): o Admin API
    // do Supabase Auth normaliza e-mail pra minúsculo sozinho ao gravar em
    // auth.users, mas um update comum em `students` via PostgREST NÃO
    // normaliza nada — grava exatamente o que for passado. Se as duas
    // tabelas divergissem em maiúscula/minúscula, o match de RLS
    // (students.email = auth.jwt()->>'email', sempre lowercase no JWT)
    // quebraria o acesso do aluno. request-student-email-change já
    // normaliza antes de gravar o pedido, mas normalizar de novo aqui é
    // garantia, não esperança de que o passo anterior sempre fez certo.
    const newEmailNorm = reqRow.new_email.toLowerCase();

    // Externo primeiro, local depois — se o Admin API falhar, nada muda em
    // students, nunca fica um estado em que o app "acha" que trocou mas o
    // login continua com o e-mail velho.
    const { error: authUpdateErr } = await supaAdmin.auth.admin.updateUserById(authUserId, { email: newEmailNorm });
    if (authUpdateErr) throw new Error('Falha ao atualizar o e-mail de login: ' + authUpdateErr.message);

    const { error: studentUpdateErr } = await supaAdmin.from('students')
      .update({ email: newEmailNorm, pending_email: null }).eq('id', student.id);
    if (studentUpdateErr) {
      // Estado inconsistente por um instante (mesmo risco residual já
      // aceito em outros fluxos de duas escritas coordenadas do projeto) —
      // reporta claro em vez de fingir sucesso.
      throw new Error('E-mail de login trocado, mas falhou ao atualizar o cadastro: ' + studentUpdateErr.message + '. Avise seu personal.');
    }

    await supaAdmin.from('student_email_change_requests').update({ used_at: new Date().toISOString() }).eq('id', reqRow.id);

    return jsonResponse({ ok: true, new_email: newEmailNorm });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
