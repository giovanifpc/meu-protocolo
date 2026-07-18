// Gera uma sugestão de protocolo de treino via Claude, usando o histórico
// de treinos, a anamnese e as respostas do wizard (objetivo, nível,
// frequência, duração de sessão) como contexto. O profissional revisa/edita
// antes de publicar — isso nunca salva nada sozinho, só devolve uma sugestão.
//
// Deploy:   supabase functions deploy generate-workout
// Secret:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Usa o JWT de quem chamou (repassado automaticamente pelo supa.functions.invoke
// do client) pra criar um client Supabase autenticado como esse usuário — a
// leitura de aluno/histórico/protocolo/anamnese passa pela RLS normal, sem
// precisar de service role key.
//
// Divisão de responsabilidade deliberada: a IA decide EXERCÍCIOS, DIVISÃO
// (quantos treinos, o que cada um trabalha) e TÉCNICA de intensificação por
// exercício. A progressão numérica semana a semana (sets/reps/descanso por
// semana do mesociclo) continua sendo calculada pelo generateWeeks() do
// front-end (mesma função determinística que o modo manual usa) — pedir
// pro modelo fazer essa aritmética seria mais caro e menos confiável do
// que reaproveitar código já testado.

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

// Técnicas de intensificação mais arriscadas/exigentes — vetadas por código
// pra aluno iniciante, não só por instrução no prompt. É uma garantia, não
// uma esperança de que o modelo respeitou a regra.
const TECNICAS_RESTRITAS_INICIANTE = ['Drop-Set', 'Cluster', 'Negativo', 'Rest-Pause'];

function aplicarVetoPorNivel(workouts: any[], nivel: string) {
  if (nivel !== 'iniciante') return workouts;
  return workouts.map((w) => ({
    ...w,
    exercises: (w.exercises || []).map((ex: any) => {
      if (ex.tecnica && TECNICAS_RESTRITAS_INICIANTE.includes(ex.tecnica)) {
        return { ...ex, tecnica: null };
      }
      return ex;
    }),
  }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autenticado.');

    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      student_id,
      objetivo,
      categoria_objetivo,
      nivel,
      frequencia,
      duracao_sessao_min,
    } = await req.json();
    if (!student_id) throw new Error('student_id é obrigatório.');

    const { data: { user } } = await supa.auth.getUser();
    if (!user) throw new Error('Sessão inválida.');

    const { data: professional } = await supa
      .from('professionals').select('id, display_name').eq('email', user.email).maybeSingle();
    if (!professional) throw new Error('Profissional não encontrado.');

    const { data: student, error: studentErr } = await supa
      .from('students').select('id, nome').eq('id', student_id).maybeSingle();
    if (studentErr || !student) throw new Error('Aluno não encontrado ou sem permissão pra acessá-lo.');

    const { data: anamnese } = await supa
      .from('student_anamnese')
      .select('historico_medico, lesoes, restricoes, fumante')
      .eq('student_id', student_id)
      .maybeSingle();

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

    const anamneseLinhas: string[] = [];
    if (anamnese?.lesoes) anamneseLinhas.push(`Lesões: ${anamnese.lesoes}`);
    if (anamnese?.restricoes) anamneseLinhas.push(`Restrições: ${anamnese.restricoes}`);
    if (anamnese?.historico_medico) anamneseLinhas.push(`Histórico médico: ${anamnese.historico_medico}`);
    if (anamnese?.fumante) anamneseLinhas.push('Fumante: sim');
    const anamneseTexto = anamneseLinhas.length
      ? anamneseLinhas.join('\n')
      : 'Nada reportado — sem restrições conhecidas.';

    const freq = Math.min(6, Math.max(2, Number(frequencia) || 4));
    const duracaoSessao = Number(duracao_sessao_min) || 60;
    const nivelFinal = ['iniciante', 'intermediario', 'avancado'].includes(nivel) ? nivel : 'intermediario';
    const objetivoFinal = ['hipertrofia', 'emagrecimento', 'saude'].includes(categoria_objetivo) ? categoria_objetivo : 'hipertrofia';

    // Regra de exercícios por sessão, calibrada pra caber na duração escolhida
    // (~7-9min por exercício considerando séries+descanso+transição).
    const exerciciosPorSessao = Math.max(3, Math.min(9, Math.round(duracaoSessao / 8)));

    const prompt = `Você é um preparador físico de elite montando um protocolo de treino de musculação pro aluno ${student.nome}.

DADOS DO ALUNO
Objetivo: ${objetivoFinal}
Nível: ${nivelFinal}
Anamnese/saúde:
${anamneseTexto}

CONFIGURAÇÃO PEDIDA PELO PROFISSIONAL
Frequência semanal: ${freq}x
Duração de cada sessão: ~${duracaoSessao} minutos (por isso cada treino deve ter aproximadamente ${exerciciosPorSessao} exercícios)
Observação adicional do profissional: ${objetivo || 'nenhuma'}

PROTOCOLO ANTERIOR (pra não repetir sem motivo, e progredir carga/volume onde o histórico mostrar evolução)
${protocoloAtual}

HISTÓRICO RECENTE DE TREINOS (mais recente primeiro)
${historyResumo || 'Sem histórico ainda — é aluno novo ou sem sessões registradas.'}

REGRAS DE MONTAGEM (siga rigorosamente)
1. Gere exatamente ${freq} treinos (id "A", "B", "C"... até a letra necessária), com divisão de grupos musculares coerente com a frequência escolhida (ex: 2x = full body ou upper/lower; 3x = ABC; 4x = ABCD; 5-6x = divisão mais isolada por grupo).
2. Cada exercício pode receber uma "tecnica" de intensificação (um destes valores exatos, ou null se não se aplica): "Drop-Set", "Rest-Pause", "Cluster", "Myo-Reps", "Pirâmide Crescente", "Pirâmide Decrescente", "Super Slow", "Bi-Set", "Tri-Set", "Negativo".
3. Aplique técnica com moderação e critério — nunca em todos os exercícios. Prefira aplicar no ÚLTIMO exercício isolador de cada treino (papel de "finalizador"), nunca no primeiro exercício composto pesado do treino.
4. Para nível "iniciante": NÃO use "Drop-Set", "Cluster", "Rest-Pause" nem "Negativo" (mais arriscadas/exigentes tecnicamente) — prefira "Pirâmide Crescente", "Bi-Set" ou nenhuma técnica.
5. Nunca prescreva exercício que agrida uma lesão ou restrição reportada na anamnese acima.
6. Cada exercício tem um campo "nota_execucao": uma dica curta e específica de execução (ex: "1-3 na reserva, carga sobe a cada série", "pausa de 15s dentro da série", "reduz 20% de carga a cada drop, sem descanso entre eles") — coerente com a técnica aplicada, quando houver.
7. Use nomes de exercícios comuns e específicos em português do Brasil (ex: "Supino reto com barra", "Agachamento livre", "Puxada frente na polia").
8. sets/reps/rest de cada exercício são o ponto de partida da semana 1 — não invente uma progressão semana a semana, isso é calculado depois por outro sistema.
9. Opcionalmente, inclua UM item de cardio orientado como o ÚLTIMO exercício de um treino (nunca no meio nem no início do array) — especialmente quando o objetivo for emagrecimento ou saúde, ou quando fizer sentido como finalizador. Não é obrigatório em todo treino nem em todo protocolo. Um item de cardio usa um formato diferente dos exercícios de força (sem sets/reps/rest/tecnica): {"tipo":"cardio","nome":"string (ex: Caminhada, Bike ergométrica, Elíptico)","duracao_min":number,"intensidade":"leve"|"leve a moderada"|"moderada"|"moderada a intensa"|"intensa","nota_execucao":"string","tips":["string","string"]} — 2 a 4 dicas curtas de execução em "tips".

Responda APENAS com um JSON válido, sem texto antes ou depois, exatamente neste formato:
{
  "titulo": "string",
  "workouts": [
    { "id": "A", "name": "Treino A — nome descritivo do foco do dia", "exercises": [
      { "nome": "string", "sets": number, "reps": "string", "rest": number, "tecnica": "string ou null", "nota_execucao": "string" },
      { "tipo": "cardio", "nome": "string", "duracao_min": number, "intensidade": "string", "nota_execucao": "string", "tips": ["string"] }
    ] }
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
    suggestion.workouts = aplicarVetoPorNivel(suggestion.workouts || [], nivelFinal);
    return jsonResponse(suggestion);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
