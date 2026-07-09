// Gera uma sugestão de protocolo de treino via Claude, usando o histórico
// de treinos do aluno como contexto. O profissional revisa/edita antes de
// publicar — isso nunca salva nada sozinho, só devolve uma sugestão.
//
// Deploy:   supabase functions deploy generate-workout
// Secret:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Usa o JWT de quem chamou (repassado automaticamente pelo supa.functions.invoke
// do client) pra criar um client Supabase autenticado como esse usuário — a
// leitura de aluno/histórico/protocolo passa pela RLS normal, sem precisar de
// service role key.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const CLAUDE_MODEL = 'claude-sonnet-5';

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

    const { student_id, objetivo } = await req.json();
    if (!student_id) throw new Error('student_id é obrigatório.');

    const { data: { user } } = await supa.auth.getUser();
    if (!user) throw new Error('Sessão inválida.');

    const { data: professional } = await supa
      .from('professionals').select('id, display_name').eq('email', user.email).maybeSingle();
    if (!professional) throw new Error('Profissional não encontrado.');

    const { data: student, error: studentErr } = await supa
      .from('students').select('id, nome').eq('id', student_id).maybeSingle();
    if (studentErr || !student) throw new Error('Aluno não encontrado ou sem permissão pra acessá-lo.');

    const { data: history } = await supa
      .from('training_history')
      .select('workout_id, workout_name, completed_at, minutes, detail')
      .eq('student_id', student_id)
      .order('completed_at', { ascending: false })
      .limit(20);

    const { data: lastProtocol } = await supa
      .from('training_protocols')
      .select('titulo, periodizacao, duracao_semanas, workouts')
      .eq('student_id', student_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const historyResumo = (history || []).map((h) => {
      const cargas = (h.detail?.exercises || [])
        .map((ex: { nome: string; sets?: { done?: boolean; carga?: string }[] }) => {
          const valores = (ex.sets || []).filter((s) => s.done && s.carga).map((s) => parseFloat(s.carga || '0') || 0);
          const max = valores.length ? Math.max(...valores) : 0;
          return max > 0 ? `${ex.nome}: ${max}kg` : null;
        })
        .filter(Boolean);
      return `${(h.completed_at || '').slice(0, 10)} — Treino ${h.workout_id} (${h.workout_name}), ${h.minutes}min${cargas.length ? ' — ' + cargas.join(', ') : ''}`;
    }).join('\n');

    const protocoloAtual = lastProtocol
      ? `Título: ${lastProtocol.titulo}\nExercícios usados: ${(lastProtocol.workouts || []).flatMap((w: { exercises: { nome: string }[] }) => w.exercises.map((e) => e.nome)).join(', ')}`
      : 'Nenhum protocolo anterior.';

    const prompt = `Você é assistente de um personal trainer montando um protocolo de treino pro aluno ${student.nome}.

Objetivo passado pelo profissional: ${objetivo || 'não especificado — use bom senso com base no histórico'}

Protocolo anterior:
${protocoloAtual}

Histórico recente de treinos (mais recente primeiro):
${historyResumo || 'Sem histórico ainda — é aluno novo ou sem sessões registradas.'}

Monte um protocolo de treino novo, coerente com a evolução observada no histórico (progrida carga/volume onde fizer sentido pela evolução de carga registrada, evite repetir exatamente o mesmo protocolo sem motivo). Use nomes de exercícios comuns e específicos em português do Brasil (ex: "Supino reto com barra", "Agachamento livre", "Puxada frente na polia").

Responda APENAS com um JSON válido, sem texto antes ou depois, exatamente neste formato:
{
  "titulo": "string",
  "workouts": [
    { "id": "A", "name": "Treino A — nome descritivo", "exercises": [ { "nome": "string", "sets": number, "reps": "string", "rest": number } ] }
  ]
}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Erro na API da Claude (${claudeRes.status}): ${errText.slice(0, 300)}`);
    }

    const claudeData = await claudeRes.json();
    const text = (claudeData.content || [])
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string }) => c.text)
      .join('');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const motivo = claudeData.stop_reason === 'max_tokens'
        ? 'a resposta da IA foi cortada por ficar longa demais'
        : `resposta inesperada da IA: "${text.slice(0, 150) || '(vazia)'}"`;
      throw new Error(`A IA não retornou um JSON válido (${motivo}). Tente de novo.`);
    }

    const suggestion = JSON.parse(jsonMatch[0]);
    return jsonResponse(suggestion);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
