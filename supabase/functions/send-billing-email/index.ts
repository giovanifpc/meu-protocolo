// Envia o e-mail de aviso de cobrança (cartão em 3 dias, ou Pix pronto pra
// pagar) — nível 1 (aluno) e nível 2 (assinatura do profissional), mesmo
// mecanismo/layout pros dois. Nunca passa pelo SMTP do Supabase Auth (esse só
// dispara os templates fixos de autenticação) — chama a API do Resend
// diretamente. Só é chamada internamente por billing-cron-daily (protegida
// pelo mesmo shared secret), nunca pelo client.
//
// Deploy:  supabase functions deploy send-billing-email --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=... CRON_SHARED_SECRET=...

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET')!;
const FROM = 'Meu Protocolo <financeiro@meuprotocolo.app>';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F8F9FA;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FA;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;max-width:480px;width:100%;">
        <tr><td style="background:linear-gradient(135deg,#2D6BE4,#1E8C64);padding:22px 24px;">
          <span style="color:#fff;font-size:16px;font-weight:700;">Meu Protocolo</span>
        </td></tr>
        <tr><td style="padding:28px 24px;color:#1E2A3A;">
          <h1 style="font-size:18px;margin:0 0 14px;">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #E9EBEF;color:#94A0AF;font-size:11px;">
          Meu Protocolo — dúvidas? fale pelo app ou suporte@meuprotocolo.app
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;
}

function cartaoAvisoHtml(params: any) {
  const contexto = params.contexto === 'profissional' ? 'sua assinatura do Meu Protocolo' : `sua mensalidade com ${params.nomeProfissional || 'seu personal'}`;
  return layout('Cobrança em 3 dias', `
    <p style="font-size:14px;line-height:1.6;">Olá, ${params.nome || ''}!</p>
    <p style="font-size:14px;line-height:1.6;">${contexto} será cobrada em <strong>3 dias</strong>, no valor de <strong>${money(Number(params.valor))}</strong>, no seu cartão cadastrado.</p>
    <p style="font-size:13px;line-height:1.6;color:#63707F;">Se quiser trocar o método de pagamento antes disso, é só abrir o app e ir em ${params.contexto === 'profissional' ? 'Perfil → Seu plano' : 'Financeiro'}.</p>
  `);
}

function pixProntoHtml(params: any) {
  return layout('Seu Pix está pronto', `
    <p style="font-size:14px;line-height:1.6;">Olá, ${params.nome || ''}!</p>
    <p style="font-size:14px;line-height:1.6;">Sua mensalidade com ${params.nomeProfissional || 'seu personal'} (<strong>${money(Number(params.valor))}</strong>) vence em 3 dias. Geramos o Pix pra você pagar:</p>
    ${params.qrBase64 ? `<div style="text-align:center;margin:16px 0;"><img src="data:image/png;base64,${params.qrBase64}" width="200" height="200" alt="QR Pix" style="border-radius:8px;"></div>` : ''}
    <div style="background:#F8F9FA;border:1px solid #E9EBEF;border-radius:10px;padding:10px 12px;font-size:12px;word-break:break-all;color:#1E2A3A;">${params.copiaCola || ''}</div>
    <p style="font-size:13px;line-height:1.6;color:#63707F;margin-top:14px;">Copie o código acima no app do seu banco, ou escaneie o QR. Prefere cartão? Troque o método dentro do app, na aba Financeiro.</p>
  `);
}

Deno.serve(async (req) => {
  try {
    if (req.headers.get('x-cron-secret') !== CRON_SHARED_SECRET) {
      return jsonResponse({ error: 'Não autorizado.' }, 401);
    }
    const { to, variant, params } = await req.json();
    if (!to || !variant) throw new Error('to e variant são obrigatórios.');

    let subject: string;
    let html: string;
    if (variant === 'cartao_aviso') {
      subject = 'Cobrança em 3 dias — Meu Protocolo';
      html = cartaoAvisoHtml(params || {});
    } else if (variant === 'pix_pronto') {
      subject = 'Seu Pix está pronto — Meu Protocolo';
      html = pixProntoHtml(params || {});
    } else {
      throw new Error('variant inválida.');
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    const bodyText = await res.text();
    if (!res.ok) throw new Error(`Resend respondeu ${res.status}: ${bodyText}`);

    return jsonResponse({ sent: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
