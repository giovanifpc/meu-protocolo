-- Ícone flutuante de suporte do profissional agora é opcional (2026-07-24) —
-- pedido do usuário depois de decidir que o aluno NUNCA deve ter o ícone
-- flutuante (só uma entrada no menu lateral, "Tirar dúvidas"). Do lado do
-- profissional, o ícone continua existindo por padrão, mas agora com um
-- toggle liga/desliga em Configurações — quem preferir a tela mais limpa
-- pode desligar (o menu lateral do profissional também ganhou "Tirar
-- dúvidas" nesta sessão, então desligar o ícone não tira o acesso ao chat).
alter table professionals add column if not exists support_fab_enabled boolean not null default true;
