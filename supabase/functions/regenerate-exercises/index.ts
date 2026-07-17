// Troca os exercícios de UM bloco de treino (ex: só o Treino A), mantendo
// tudo o mais como está — sets/reps/descanso/periodização/técnica não são
// tocados aqui, isso é responsabilidade do front-end depois de receber a
// resposta. Essa função só decide NOVOS NOMES de exercício, um por um,
// mirando o mesmo grupo muscular do exercício atual.
//
// É a ação "profissional cansado, só quer variedade sem remontar nada" —
// pensada pra ser rápida e barata (prompt pequeno, tarefa bem restrita),
// diferente do generate-workout que monta o protocolo inteiro do zero.
//
// Deploy: supabase functions deploy regenerate-exercises

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

    const { student_id, exercises } = await req.json();
    if (!student_id) throw new Error('student_id é obrigatório.');
    if (!Array.isArray(exercises) || !exercises.length) throw new Error('Lista de exercícios vazia.');

    const { data: { user } } = await supa.auth.getUser();
    if (!user) throw new Error('Sessão inválida.');

    const { data: professional } = await supa
      .from('professionals').select('id').eq('email', user.email).maybeSingle();
    if (!professional) throw new Error('Profissional não encontrado.');

    const { data: student, error: studentErr } = await supa
      .from('students').select('id').eq('id', student_id).maybeSingle();
    if (studentErr || !student) throw new Error('Aluno não encontrado ou sem permissão pra acessá-lo.');

    const { data: anamnese } = await supa
      .from('student_anamnese')
      .select('lesoes, restricoes')
      .eq('student_id', student_id)
      .maybeSingle();
    const restricoesTexto = [anamnese?.lesoes, anamnese?.restricoes].filter(Boolean).join(' | ') || 'nenhuma';

    // Grupo muscular real de cada exercício (quando conhecido na biblioteca)
    // — mais confiável do que pedir pro modelo adivinhar pelo nome.
    const exerciseIds = exercises.map((e: { exercise_id?: number }) => e.exercise_id).filter(Boolean);
    let gruposById: Record<number, string> = {};
    if (exerciseIds.length) {
      const { data: libRows } = await supa
        .from('exercise_library')
        .select('exercise_id, grupo_muscular')
        .in('exercise_id', exerciseIds);
      (libRows || []).forEach((r: { exercise_id: number; grupo_muscular: string }) => {
        gruposById[r.exercise_id] = r.grupo_muscular;
      });
    }

    const listaTexto = exercises.map((ex: { exercise_id?: number; nome: string }, i: number) =>
      `${i + 1}. ${ex.nome}${ex.exercise_id && gruposById[ex.exercise_id] ? ` (grupo: ${gruposById[ex.exercise_id]})` : ''}`
    ).join('\n');

    const prompt = `Você é um preparador físico. Troque cada exercício da lista abaixo por uma ALTERNATIVA diferente que trabalhe o MESMO grupo muscular/padrão de movimento, pra dar variedade ao aluno sem mudar o objetivo do treino.

Restrições de saúde do aluno (nunca sugerir exercício que agrida isso): ${restricoesTexto}

Exercícios atuais (na ordem):
${listaTexto}

Regras:
- Cada substituto deve ser diferente do exercício atual na mesma posição.
- Mantenha o mesmo grupo muscular/padrão de movimento (ex: trocar "Supino reto com barra" por "Supino reto com halteres" ou "Crucifixo máquina", nunca por algo de perna).
- Use nomes de exercícios comuns e específicos em português do Brasil.

Responda APENAS com um JSON válido, sem texto antes ou depois, exatamente neste formato (mesma ordem e mesma quantidade da lista acima):
{ "exercises": [ { "nome": "string" } ] }`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
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
      throw new Error(`A IA não retornou um JSON válido. Tente de novo.`);
    }

    const result = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(result.exercises) || result.exercises.length !== exercises.length) {
      throw new Error('A IA retornou uma quantidade de exercícios diferente da esperada. Tente de novo.');
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
