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

// Rede de segurança contra exercício fora de contexto (ex: "Glúteo na
// polia" aparecendo do nada num treino de "Peito e Tríceps") — garantia por
// código, não só por instrução no prompt (mesmo princípio de
// aplicarVetoPorNivel acima). Detecta o(s) grupo(s) musculares que o NOME
// do treino declara e remove qualquer exercício de um grupo claramente
// diferente. Heurística por palavra-chave, deliberadamente conservadora:
// só age quando consegue detectar grupo tanto no título quanto no
// exercício — na dúvida, não filtra (evita falso positivo derrubando um
// exercício válido só porque o nome não bateu com nenhuma palavra-chave).
const GRUPOS_KEYWORDS: Record<string, string[]> = {
  peito: ['peito', 'peitoral', 'supino', 'crucifixo', 'cross over', 'crossover', 'voador', 'peck deck'],
  triceps: ['tríceps', 'triceps'],
  costas: ['costas', 'dorsal', 'puxada', 'remada', 'pulldown', 'levantamento terra', 'barra fixa', 'pull-up', 'pulley'],
  biceps: ['bíceps', 'biceps', 'rosca'],
  ombro: ['ombro', 'deltoide', 'deltóide', 'desenvolvimento', 'elevação lateral', 'elevação frontal', 'arnold press', 'encolhimento'],
  perna: ['perna', 'quadríceps', 'quadriceps', 'posterior de coxa', 'isquiotibial', 'agachamento', 'leg press', 'cadeira extensora', 'cadeira flexora', 'panturrilha', 'afundo', 'passada', 'stiff', 'hack machine', 'avanço'],
  gluteo: ['glúteo', 'gluteo', 'elevação pélvica', 'hip thrust', 'coice', 'quatro apoios', 'abdução de quadril', 'abdutora'],
  abdomen: ['abdôm', 'abdom', 'prancha', 'oblíquo', 'obliquo', 'abdominal'],
};

function detectarGrupos(texto: string): string[] {
  const t = (texto || '').toLowerCase();
  return Object.entries(GRUPOS_KEYWORDS)
    .filter(([, kws]) => kws.some((k) => t.includes(k)))
    .map(([g]) => g);
}

function filtrarExerciciosForaDeContexto(workouts: any[]) {
  return workouts.map((w) => {
    const gruposDoDia = detectarGrupos(w.name || '');
    // Sem grupo detectável no título (ex: "Full Body", "Treino A" genérico
    // sem foco declarado) — não há base pra decidir, não filtra nada.
    if (!gruposDoDia.length) return w;
    const exercises = (w.exercises || []).filter((ex: any) => {
      if (ex.tipo === 'cardio') return true; // cardio nunca é filtrado por grupo muscular
      const gruposDoExercicio = detectarGrupos(ex.nome || '');
      if (!gruposDoExercicio.length) return true; // nome sem palavra-chave reconhecida — não bloqueia
      return gruposDoExercicio.some((g) => gruposDoDia.includes(g));
    });
    return { ...w, exercises };
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
      .from('students').select('id, nome, genero').eq('id', student_id).maybeSingle();
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

    const generoTexto = student.genero === 'M' ? 'Masculino' : student.genero === 'F' ? 'Feminino' : 'Não informado';

    const prompt = `Você é um preparador físico de elite montando um protocolo de treino de musculação pro aluno ${student.nome}.

DADOS DO ALUNO
Objetivo: ${objetivoFinal}
Nível: ${nivelFinal}
Gênero: ${generoTexto}
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
1b. CRÍTICO — nunca inclua um exercício de grupo muscular fora do que o nome do treino declara. Ex: um treino chamado "Peito e Tríceps" NUNCA pode ter um exercício de glúteo, perna ou costas misturado "de brinde" — isso é um erro grave. Cada exercício dentro de um treino precisa pertencer a algum dos grupos musculares citados no "name" daquele treino (exceto o item de cardio opcional da regra 9, que não tem grupo muscular).
1c. Se o gênero do aluno for informado (Masculino/Feminino), use isso só como um leve ajuste de ênfase/seleção dentro do que já é fisiologicamente coerente — nunca como estereótipo rígido nem tema/cor. Nada de incluir exercício isolado de um grupo alheio ao foco do treino do dia só por causa do gênero (isso continua proibido pela regra 1b); o ajuste é sutil, dentro dos exercícios que já fazem sentido pro treino: ex. alguma prioridade extra pra glúteo/posterior de coxa em dias de perna pra alunas que buscam hipertrofia de membros inferiores, ou ênfase em peito/costas/ombro pros objetivos mais comuns de alunos. Se não informado, monte sem nenhum viés de gênero.
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
    suggestion.workouts = filtrarExerciciosForaDeContexto(suggestion.workouts || []);
    suggestion.workouts = aplicarVetoPorNivel(suggestion.workouts, nivelFinal);
    return jsonResponse(suggestion);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
