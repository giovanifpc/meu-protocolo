// Passo 1 do fluxo de troca de e-mail do aluno (2026-08-10, ver
// escopo-ajustes-agosto2026.md item 5) — o profissional pede a troca, mas
// students.email só muda de verdade quando o aluno confirma no e-mail NOVO
// (confirm-student-email-change), nunca aqui. Por que a confirmação existe:
// students.email = auth.jwt() ->> 'email' resolve "quem é o aluno logado"
// em praticamente toda RLS do projeto (supabase_02) — um erro de digitação
// no e-mail novo trancaria o aluno pra fora sem ninguém perceber na hora.
//
// Deploy:   supabase functions deploy request-student-email-change
// Secrets:  RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY (já existem)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM = 'Meu Protocolo <financeiro@meuprotocolo.app>';
const MASTER_EMAIL = 'meuprotocolo1@gmail.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sha256Hex(text: string) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autenticado.');

    // Client escopado pelo JWT do profissional — a leitura de `students`
    // abaixo só funciona se a RLS ("professional manages own students")
    // permitir, então "achou a linha" já É a prova de posse do aluno.
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) throw new Error('Sessão inválida.');

    const { student_id, new_email, cancel } = await req.json();
    if (!student_id) throw new Error('student_id é obrigatório.');

    const { data: student, error: studentErr } = await supa
      .from('students').select('id, nome, email').eq('id', student_id).maybeSingle();
    if (studentErr || !student) throw new Error('Aluno não encontrado ou sem permissão pra acessá-lo.');

    // Service role pra tudo daqui pra frente — checar colisão em QUALQUER
    // tenant (não só o do profissional chamador) e gravar/invalidar o
    // pedido/token (student_email_change_requests é bloqueada pra client
    // direto, RLS habilitada sem policy, mesmo padrão de outras tabelas
    // sensíveis do projeto).
    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Modo cancelar (2026-08-10) — invalida qualquer pedido pendente desse
    // aluno sem criar um novo. Reaproveita a mesma function em vez de criar
    // uma terceira Edge Function só pra isso.
    if (cancel) {
      await supaAdmin.from('student_email_change_requests').update({ used_at: new Date().toISOString() })
        .eq('student_id', student_id).is('used_at', null);
      const { error: clearErr } = await supaAdmin.from('students').update({ pending_email: null }).eq('id', student_id);
      if (clearErr) throw new Error('Erro ao cancelar a troca pendente: ' + clearErr.message);
      return jsonResponse({ ok: true, cancelled: true });
    }

    if (!new_email) throw new Error('new_email é obrigatório.');
    const newEmailNorm = String(new_email).trim().toLowerCase();
    if (!isValidEmail(newEmailNorm)) throw new Error('E-mail inválido.');
    if (student.email.toLowerCase() === newEmailNorm) throw new Error('Esse já é o e-mail atual do aluno.');
    if (newEmailNorm === MASTER_EMAIL) throw new Error('Esse e-mail não pode ser usado.');

    // Guarda contra colisão de identidade — mesma classe de bug já
    // corrigida em master_create_professional (supabase_60, guarda de
    // e-mail de aluno/master): se o e-mail novo já é de outro aluno (de
    // qualquer profissional) ou de outro profissional, a troca quebraria
    // o login de quem já é dono desse e-mail hoje.
    const { data: existingStudent } = await supaAdmin
      .from('students').select('id').ilike('email', newEmailNorm).maybeSingle();
    if (existingStudent) throw new Error('Esse e-mail já pertence a outro aluno cadastrado.');
    const { data: existingPro } = await supaAdmin
      .from('professionals').select('id').ilike('email', newEmailNorm).maybeSingle();
    if (existingPro) throw new Error('Esse e-mail já pertence a uma conta de profissional.');

    // Reenviar (pedido de novo, ex: e-mail perdido/expirado) invalida
    // qualquer pedido anterior ainda pendente desse aluno — só o link mais
    // recente continua válido.
    await supaAdmin.from('student_email_change_requests').update({ used_at: new Date().toISOString() })
      .eq('student_id', student_id).is('used_at', null);

    const rawToken = randomToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: insertErr } = await supaAdmin.from('student_email_change_requests').insert({
      student_id, new_email: newEmailNorm, token_hash: tokenHash, expires_at: expiresAt,
    });
    if (insertErr) throw new Error('Erro ao gerar o pedido de troca: ' + insertErr.message);

    const { error: pendingErr } = await supaAdmin.from('students').update({ pending_email: newEmailNorm }).eq('id', student_id);
    if (pendingErr) throw new Error('Erro ao salvar o e-mail pendente: ' + pendingErr.message);

    const link = `https://meuprotocolo.app/confirmar-email.html?token=${rawToken}`;
    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F8F9FA;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FA;padding:24px 0;">
        <tr><td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;max-width:480px;width:100%;">
            <tr><td style="background:linear-gradient(135deg,#2D6BE4,#1E8C64);padding:22px 24px;">
              <span style="color:#fff;font-size:16px;font-weight:700;">Meu Protocolo</span>
            </td></tr>
            <tr><td style="padding:28px 24px;color:#1E2A3A;">
              <h1 style="font-size:18px;margin:0 0 14px;">Confirme seu novo e-mail</h1>
              <p style="font-size:14px;line-height:1.6;">Olá, ${student.nome}!</p>
              <p style="font-size:14px;line-height:1.6;">Seu personal trainer pediu pra trocar o e-mail da sua conta no Meu Protocolo pra este endereço. Confirme clicando no botão abaixo — o link expira em 24h.</p>
              <div style="text-align:center;margin:22px 0;">
                <a href="${link}" style="display:inline-block;background:#2D6BE4;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;">Confirmar novo e-mail</a>
              </div>
              <p style="font-size:12.5px;line-height:1.6;color:#63707F;">Se você não esperava isso, ignore este e-mail — nada muda até você confirmar.</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
      </body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [newEmailNorm], subject: 'Confirme seu novo e-mail — Meu Protocolo', html }),
    });
    if (!res.ok) throw new Error(`Falha ao enviar o e-mail (Resend ${res.status}).`);

    return jsonResponse({ ok: true, pending_email: newEmailNorm });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
