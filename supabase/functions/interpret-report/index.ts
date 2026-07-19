// Interpretação de relatório por IA (feature exclusiva do plano Elite).
// Diferente do generate-workout, aqui a IA não decide nada que vira dado —
// só lê um resumo já calculado deterministicamente (adesão, evolução de
// carga, evolução física, água/sono) e devolve um texto interpretativo em
// linguagem natural pro profissional. Mesma divisão de responsabilidade já
// usada no resto do projeto: aritmética é sempre determinística, a IA só
// interpreta/redige.
//
// Deploy:   supabase functions deploy interpret-report
// Secret:   ANTHROPIC_API_KEY já configurada (mesma usada por generate-workout)
//
// Gating: checado aqui também (não só no front) — é controle de custo real,
// uma chamada direta à function por alguém fora do Elite não pode passar.

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

type HistoryRow = {
  completed_at: string;
  workout_name: string;
  minutes: number;
  detail: { incomplete?: boolean; rating?: string; exercises?: { nome: string; sets?: { done?: boolean; carga?: string }[] }[] } | null;
};

function resumoAdesao(history: HistoryRow[]) {
  const now = new Date();
  const completed = history.filter((h) => !h.detail?.incomplete);
  const adherence = history.length ? Math.round((completed.length / history.length) * 100) : 0;
  const last = history[0];
  const daysSinceLast = last ? Math.floor((now.getTime() - new Date(last.completed_at).getTime()) / 86400000) : null;
  const ratingCounts: Record<string, number> = {};
  history.forEach((h) => { const r = h.detail?.rating; if (r) ratingCounts[r] = (ratingCounts[r] || 0) + 1; });
  return {
    total_sessoes: history.length,
    sessoes_completas: completed.length,
    adesao_pct: adherence,
    dias_desde_ultima_sessao: daysSinceLast,
    avaliacoes_pos_treino: ratingCounts,
  };
}

function resumoEvolucaoCarga(history: HistoryRow[]) {
  const byEx: Record<string, number[]> = {};
  [...history].reverse().forEach((h) => {
    (h.detail?.exercises || []).forEach((ex) => {
      const cargas = (ex.sets || []).filter((s) => s.done && s.carga).map((s) => parseFloat(s.carga || '0') || 0);
      const max = cargas.length ? Math.max(...cargas) : 0;
      if (max > 0) { if (!byEx[ex.nome]) byEx[ex.nome] = []; byEx[ex.nome].push(max); }
    });
  });
  return Object.entries(byEx)
    .filter(([, v]) => v.length >= 2)
    .map(([nome, v]) => ({ exercicio: nome, carga_inicial_kg: v[0], carga_atual_kg: v[v.length - 1], variacao_kg: +(v[v.length - 1] - v[0]).toFixed(1) }));
}

type Assessment = { avaliado_em: string; peso_kg: number | null; bioimpedancia: { percentual_gordura?: number } | null; resultado_dobras: { percentual_gordura?: number } | null };

function resumoEvolucaoFisica(assessments: Assessment[]) {
  if (assessments.length < 1) return { avaliacoes: 0, detalhe: 'Nenhuma avaliação física finalizada ainda.' };
  const pct = (a: Assessment) => a.bioimpedancia?.percentual_gordura ?? a.resultado_dobras?.percentual_gordura ?? null;
  const first = assessments[0];
  const lastA = assessments[assessments.length - 1];
  return {
    avaliacoes: assessments.length,
    primeira_em: first.avaliado_em,
    ultima_em: lastA.avaliado_em,
    peso_inicial_kg: first.peso_kg,
    peso_atual_kg: lastA.peso_kg,
    percentual_gordura_inicial: pct(first),
    percentual_gordura_atual: pct(lastA),
  };
}

type Checkin = { date_key: string; water_ml: number | null; sleep_quality: string | null; sleep_duration: string | null };

function resumoBemEstar(checkins: Checkin[], metaAguaMl: number) {
  if (!checkins.length) return { dias_registrados: 0, detalhe: 'Aluno ainda não fez nenhum check-in de água/sono.' };
  const comAgua = checkins.filter((c) => c.water_ml != null);
  const mediaAgua = comAgua.length ? Math.round(comAgua.reduce((s, c) => s + (c.water_ml || 0), 0) / comAgua.length) : null;
  const diasAbaixoMeta = comAgua.filter((c) => (c.water_ml || 0) < metaAguaMl * 0.7).length;
  const comSono = checkins.filter((c) => c.sleep_quality || c.sleep_duration);
  const diasSonoRuim = comSono.filter((c) => c.sleep_quality === 'mal').length;
  const diasSonoCurto = comSono.filter((c) => c.sleep_duration === 'menos6').length;
  return {
    dias_registrados: checkins.length,
    meta_agua_ml: metaAguaMl,
    media_agua_ml: mediaAgua,
    dias_agua_abaixo_de_70pct_da_meta: diasAbaixoMeta,
    dias_com_registro_de_sono: comSono.length,
    dias_sono_ruim: diasSonoRuim,
    dias_sono_menos_de_6h: diasSonoCurto,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autenticado.');

    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { student_id } = await req.json();
    if (!student_id) throw new Error('student_id é obrigatório.');

    const { data: { user } } = await supa.auth.getUser();
    if (!user) throw new Error('Sessão inválida.');

    const { data: professional } = await supa
      .from('professionals').select('id, display_name, plan').eq('email', user.email).maybeSingle();
    if (!professional) throw new Error('Profissional não encontrado.');
    if (professional.plan !== 'elite') throw new Error('Interpretação por IA é exclusiva do plano Elite.');

    const { data: student, error: studentErr } = await supa
      .from('students').select('id, nome').eq('id', student_id).maybeSingle();
    if (studentErr || !student) throw new Error('Aluno não encontrado ou sem permissão pra acessá-lo.');

    const { data: protocol } = await supa
      .from('training_protocols').select('titulo, periodizacao, duracao_semanas')
      .eq('student_id', student_id).eq('status', 'publicado')
      .order('publicado_em', { ascending: false }).limit(1).maybeSingle();

    const { data: history } = await supa
      .from('training_history').select('completed_at, workout_name, minutes, detail')
      .eq('student_id', student_id).order('completed_at', { ascending: false }).limit(30);

    const { data: assessments } = await supa
      .from('physical_assessments').select('avaliado_em, peso_kg, bioimpedancia, resultado_dobras')
      .eq('student_id', student_id).eq('status', 'finalizada').order('avaliado_em', { ascending: true });

    const { data: anamnese } = await supa
      .from('student_anamnese').select('lesoes, restricoes, historico_medico, fumante')
      .eq('student_id', student_id).maybeSingle();

    const trintaDiasAtras = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: checkins } = await supa
      .from('student_checkins').select('date_key, water_ml, sleep_quality, sleep_duration')
      .eq('student_id', student_id).gte('date_key', trintaDiasAtras).order('date_key', { ascending: true });

    const assessmentsList = assessments || [];
    const pesoAtual = assessmentsList.length ? assessmentsList[assessmentsList.length - 1].peso_kg : null;
    const metaAguaMl = pesoAtual ? Math.round(pesoAtual * 35) : 2000;

    const dados = {
      aluno: student.nome,
      protocolo: protocol ? { titulo: protocol.titulo, periodizacao: protocol.periodizacao, duracao_semanas: protocol.duracao_semanas } : null,
      adesao: resumoAdesao(history || []),
      evolucao_carga: resumoEvolucaoCarga(history || []),
      evolucao_fisica: resumoEvolucaoFisica(assessmentsList),
      bem_estar: resumoBemEstar(checkins || [], metaAguaMl),
      anamnese: anamnese ? { lesoes: anamnese.lesoes || null, restricoes: anamnese.restricoes || null, historico_medico: anamnese.historico_medico || null, fumante: !!anamnese.fumante } : null,
    };

    const prompt = `Você é um preparador físico sênior interpretando os dados de acompanhamento do aluno ${student.nome} pro profissional responsável por ele.

DADOS JÁ CALCULADOS (não refaça nenhuma conta, use os números como estão):
${JSON.stringify(dados, null, 2)}

Escreva uma interpretação em texto corrido, em português do Brasil, curta e direta (o profissional lê isso entre um atendimento e outro — sem enrolação, sem markdown, sem asteriscos, sem títulos numerados). Organize em 4 blocos curtos, cada um com um cabeçalho simples em maiúsculas seguido de quebra de linha (ex: "ADESÃO E CONSISTÊNCIA"):

1. ADESÃO E CONSISTÊNCIA — o que os números de frequência/sessões completas/tempo desde a última sessão revelam sobre o hábito do aluno.
2. SINAIS DE BEM-ESTAR — o que os dados de água e sono sugerem (só comente o que os dados realmente mostram; se não houver registro suficiente, diga isso em vez de inventar).
3. EVOLUÇÃO FÍSICA E DE CARGA — leitura do progresso de peso/%gordura entre avaliações e da evolução de carga por exercício, se houver dado suficiente.
4. SUGESTÃO PRÁTICA — uma recomendação concreta e acionável pro profissional considerar na próxima sessão ou ajuste de protocolo, coerente com tudo acima e respeitando qualquer lesão/restrição da anamnese.

Se algum bloco não tiver dado suficiente, diga isso em uma frase curta em vez de inventar ou generalizar. Nunca dê conselho médico — só leitura de treino/adesão/hábito.`;

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
      .join('')
      .trim();
    if (!text) throw new Error('A IA não retornou nenhum texto. Tente de novo.');

    return jsonResponse({ interpretation: text });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
