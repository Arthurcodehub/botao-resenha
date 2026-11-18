// src/js/app.js
// Liga as telas aos eventos. Os dados vêm de resenhas.js e o login de auth.js.

import { entrarComGoogle, sair, quandoMudarLogin } from './auth.js';
import { criarResenha, responderResenha, listarResenhas } from './resenhas.js';
import { ouvirMudancas, pararDeOuvir } from './realtime.js';

const telaLogin = document.getElementById('tela-login');
const telaPrincipal = document.getElementById('tela-principal');
const botaoGoogle = document.getElementById('entrar-google');
const msgLogin = document.getElementById('mensagem-login');
const msg = document.getElementById('mensagem');
const lista = document.getElementById('lista');
const botaoChamar = document.getElementById('chamar');
const botaoSair = document.getElementById('sair');

// Textos dos botões: a ação que o membro vai escolher
const BOTOES_RESPOSTA = [
  { valor: 'aceito', rotulo: '🍻 Aceitar resenha' },
  { valor: 'recusado', rotulo: '❌ Recusar resenha' },
  { valor: 'outro_horario', rotulo: '🕒 Definir outro horário' },
];

// Textos da lista: o que cada membro já fez
const TEXTO_RESPOSTA = {
  aceito: '🍻 Aceitou',
  recusado: '❌ Recusou',
  outro_horario: '🕒 Sugeriu outro horário',
};

botaoGoogle.addEventListener('click', async () => {
  msgLogin.textContent = 'Abrindo o Google...';
  try {
    await entrarComGoogle();
  } catch (erro) {
    console.error(erro);
    msgLogin.textContent = `Não foi possível entrar: ${erro.message}`;
  }
});

botaoSair.addEventListener('click', () => sair());

botaoChamar.addEventListener('click', async () => {
  botaoChamar.disabled = true;
  try {
    await criarResenha();
    msg.textContent = 'Resenha chamada!';
  } catch (erro) {
    console.error(erro);
    msg.textContent = 'Não foi possível chamar a resenha.';
  } finally {
    botaoChamar.disabled = false;
  }
});

async function atualizarLista() {
  try {
    const resenhas = await listarResenhas();
    lista.replaceChildren(...resenhas.map(desenharResenha));
  } catch (erro) {
    console.error(erro);
    msg.textContent = 'Não foi possível carregar as resenhas.';
  }
}

function desenharResenha(resenha) {
  const card = document.createElement('div');
  card.className = 'card';

  const titulo = document.createElement('strong');
  titulo.textContent = `${resenha.perfis?.nome ?? 'Alguém'} chamou a resenha`;
  card.append(titulo);

  const respostas = document.createElement('ul');
  for (const r of resenha.respostas) {
    const item = document.createElement('li');
    const texto = TEXTO_RESPOSTA[r.resposta] ?? r.resposta;
    const horario = r.horario_sugerido ? ` (${r.horario_sugerido})` : '';
    item.textContent = `${r.perfis?.nome ?? 'Membro'}: ${texto}${horario}`;
    respostas.append(item);
  }
  card.append(respostas);

  for (const { valor, rotulo } of BOTOES_RESPOSTA) {
    const botao = document.createElement('button');
    botao.textContent = rotulo;
    botao.addEventListener('click', () => responder(resenha.id, valor));
    card.append(botao);
  }

  return card;
}

async function responder(resenhaId, valor) {
  let horario = null;
  if (valor === 'outro_horario') {
    horario = prompt('Qual horário você sugere?');
    if (!horario) return; // cancelou
  }
  try {
    await responderResenha(resenhaId, valor, horario);
  } catch (erro) {
    console.error(erro);
    msg.textContent = 'Não foi possível registrar sua resposta.';
  }
}

// Mostra a tela certa e liga ou desliga a escuta ao vivo conforme o login
quandoMudarLogin(async (usuario) => {
  if (usuario) {
    telaLogin.classList.add('hidden');
    telaPrincipal.classList.remove('hidden');
    await atualizarLista();
    // Qualquer mudança no banco refaz a lista, sem precisar do payload
    ouvirMudancas(atualizarLista);
  } else {
    pararDeOuvir();
    telaPrincipal.classList.add('hidden');
    telaLogin.classList.remove('hidden');
  }
});