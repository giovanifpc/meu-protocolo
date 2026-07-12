// Envia push notification pro aluno (lembrete de treino, reengajamento por
// baixa adesão). Chamado pelo painel do profissional com o JWT normal — a
// leitura de `students` passa pela RLS do chamador (confirma que o aluno é
// dele); a leitura/limpeza de `push_subscriptions` usa service role porque
// essa tabela não tem policy de leitura pro profissional (só o aluno
// gerencia a própria inscrição).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_KEYS_JSON = Deno.env.get('VAPID_KEYS_JSON')!;

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

let appServerPromise: ReturnType<typeof webpush.ApplicationServer.new> | null = null;
function getAppServer() {
  if (!appServerPromise) {
    appServerPromise = (async () => {
      const vapidKeys = await webpush.importVapidKeys(JSON.parse(VAPID_KEYS_JSON), { extractable: false });
      return webpush.ApplicationServer.new({
        contactInformation: 'mailto:contato@meuprotocolo.app',
        vapidKeys,
      });
    })();
  }
  return appServerPromise;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autenticado.');

    const supaCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supaCaller.auth.getUser();
    if (!user) throw new Error('Sessão inválida.');

    const { student_id, title, body } = await req.json();
    if (!student_id || !title) throw new Error('student_id e title são obrigatórios.');

    const { data: student, error: studentErr } = await supaCaller
      .from('students').select('id').eq('id', student_id).maybeSingle();
    if (studentErr || !student) throw new Error('Aluno não encontrado ou sem permissão pra notificá-lo.');

    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // grava o registro sempre, independente de o aluno ter push ativado —
    // é o que aparece na tela de Notificações dentro do próprio app.
    await supaAdmin.from('student_notifications').insert({ student_id, title, body: body || null });

    const { data: subs, error: subsErr } = await supaAdmin
      .from('push_subscriptions').select('*').eq('student_id', student_id);
    if (subsErr) throw new Error('Erro ao buscar inscrições de notificação: ' + subsErr.message);
    if (!subs || !subs.length) return jsonResponse({ sent: 0, message: 'Esse aluno ainda não ativou notificações no app — mas a mensagem já ficou registrada pra ele ver dentro do app.' });

    const appServer = await getAppServer();
    let sent = 0;
    const expired: string[] = [];
    for (const sub of subs) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        });
        await subscriber.pushTextMessage(JSON.stringify({ title, body: body || '' }), {});
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('404') || msg.includes('410')) expired.push(sub.id);
      }
    }
    if (expired.length) await supaAdmin.from('push_subscriptions').delete().in('id', expired);

    return jsonResponse({ sent, expired: expired.length });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
