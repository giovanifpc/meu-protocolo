// Cancela a cobrança automática de um aluno específico — chamada pelo
// profissional (alunos.html) em 3 caminhos: exclusão do aluno, status
// marcado "Inativo" (lacuna 3 do desenho de cobrança automática, CLAUDE.md),
// e "remover método de pagamento" pedido pelo próprio aluno (lacuna 2, esse
// caminho é chamado com o JWT do aluno — students.mp_charge_method some,
// nenhum passo manual extra precisa acontecer depois).
//
// Aceita tanto JWT de profissional quanto de aluno — quem chama só pode
// cancelar a cobrança do PRÓPRIO aluno (profissional) ou a PRÓPRIA cobrança
// (aluno), nunca a de outro tenant.
//
// Deploy: supabase functions deploy mercadopago-cancel-student-charge

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

const RESET_FIELDS = {
  mp_charge_method: 'nenhum',
  mp_preapproval_id: null,
  mp_subscription_status: null,
  mp_card_last4: null,
  mp_card_expiry: null,
  pix_pending_payment_id: null,
  pix_pending_qr_base64: null,
  pix_pending_copy_paste: null,
  pix_pending_expires_at: null,
};

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

    const body = await req.json().catch(() => ({}));
    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // RLS resolve quem pode ver o quê: se quem chama é o próprio aluno, a
    // policy "student reads own row" só deixa a select abaixo achar a
    // própria linha mesmo se student_id de outra pessoa for mandado; se é
    // o profissional, "professional manages own students" só acha alunos
    // dele.
    let studentQuery = supa.from('students').select('id, professional_id, mp_charge_method, mp_preapproval_id');
    studentQuery = body.student_id ? studentQuery.eq('id', body.student_id) : studentQuery.eq('email', user.email);
    const { data: student, error: stuErr } = await studentQuery.maybeSingle();
    if (stuErr || !student) throw new Error('Aluno não encontrado ou sem permissão.');

    if (student.mp_charge_method === 'nenhum' || !student.mp_preapproval_id) {
      await supaAdmin.from('students').update(RESET_FIELDS).eq('id', student.id);
      return jsonResponse({ cancelled: false, reason: 'sem cobrança automática ativa' });
    }

    const { data: conn } = await supaAdmin
      .from('professional_mp_connections').select('access_token').eq('professional_id', student.professional_id).maybeSingle();

    if (conn?.access_token) {
      try {
        await fetch(`https://api.mercadopago.com/preapproval/${student.mp_preapproval_id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${conn.access_token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' }),
        });
      } catch (e) {
        console.error('Falha ao cancelar preapproval do aluno no Mercado Pago (seguindo mesmo assim):', e);
      }
    }

    await supaAdmin.from('students').update(RESET_FIELDS).eq('id', student.id);
    return jsonResponse({ cancelled: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
