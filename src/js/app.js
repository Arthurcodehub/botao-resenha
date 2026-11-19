// src/js/app.js
// Liga as telas aos eventos. Os dados vêm de resenhas.js e grupos.js; o login, de auth.js.

import { entrarComGoogle, sair, quandoMudarLogin } from './auth.js';
import {
  criarResenha,
  responderResenha,
  listarResenhas,
  apagarResenha,
} from './resenhas.js';
import {
  listarMeusGrupos,
  criarGrupo,
  entrarNoGrupo,
  sairDoGrupo,
  gerarNovoCodigo,
  apagarGrupo,
} from './grupos.js';
import { ouvirMudancas, pararDeOuvir } from './realtime.js';

// ---------- Elementos ----------
const telaLogin = document.getElementById('tela-login');
const telaGrupos = document.getElementById('tela-grupos');
const telaPrincipal = document.getElementById('tela-principal');
const TELAS = { login: telaLogin, grupos: telaGrupos, principal: telaPrincipal };

const botaoGoogle = document.getElementById('entrar-google');
const msgLogin = document.getElementById('mensagem-login');

const listaGrupos = document.getElementById('meus-grupos');
const campoNomeGrupo = document.getElementById('nome-grupo');
const campoCodigo = document.getElementById('codigo-grupo');
const botaoCriarGrupo = document.getElementById('criar-grupo');
const botaoEntrarGrupo = document.getElementById('entrar-grupo');
const botaoSairGrupos = document.getElementById('sair-grupos');
const msgGrupos = document.getElementById('mensagem-grupos');

const botaoTrocarGrupo = document.getElementById('trocar-grupo');
const nomeDoGrupo = document.getElementById('nome-do-grupo');
const botaoChamar = document.getElementById('chamar');
const msg = document.getElementById('mensagem');
const lista = document.getElementById('lista');
const opcoesGrupo = document.getElementById('opcoes-grupo');
const codigoDoGrupo = document.getElementById('codigo-do-grupo');
const botaoConvidar = document.getElementById('convidar');
const botaoNovoCodigo = document.getElementById('novo-codigo');
const botaoSairDoGrupo = document.getElementById('sair-do-grupo');
const botaoApagarGrupo = document.getElementById('apagar-grupo');
const botaoSair = document.getElementById('sair');

// ---------- Constantes e estado ----------
const INTERVALO_ATUALIZACAO = 60_000; // some as resenhas expiradas da tela
const CHAVE_CONVITE = 'resenha:convite';
const CHAVE_GRUPO = 'resenha:grupo';

let usuarioAtual = null;
let meusGrupos = [];
let grupoAtual = null;
let temporizador = null;

// Textos dos botões: a ação que o membro vai escolher
const BOTOES_RESPOSTA = [
  { valor: 'aceito', rotulo: '🍻 Aceitar resenha' },
  { valor: 'recusado', rotulo: '❌ Recusar resenha' },
  { valor: 'outro_horario', rotulo: '🕒 Definir outro horário' },
];

// Quem criou a resenha só pode sugerir outro horário (o banco também exige isso)
const RESPOSTAS_DO_CRIADOR = ['outro_horario'];

// Textos da lista: o que cada membro já fez
const TEXTO_RESPOSTA = {
  aceito: '🍻 Aceitou',
  recusado: '❌ Recusou',
  outro_horario: '🕒 Sugeriu outro horário',
};

// ---------- Utilidades ----------
function guardar(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento (modo privado): o app segue funcionando
  }
}

function ler(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function remover(chave) {
  try {
    localStorage.removeItem(chave);
  } catch {
    // ignora
  }
}

// Mensagens escritas por nós (banco ou app) aparecem; erros técnicos viram o texto padrão
function mensagemDeErro(erro, padrao) {
  return erro?.code === 'P0001' || erro?.amigavel ? erro.message : padrao;
}

function mostrarTela(nome) {
  for (const [chave, tela] of Object.entries(TELAS)) {
    tela.classList.toggle('hidden', chave !== nome);
  }
}

function formatarHora(dataIso) {
  return new Date(dataIso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function criarTextoVazio(texto) {
  const p = document.createElement('p');
  p.className = 'vazio';
  p.textContent = texto;
  return p;
}

// ---------- Link de convite ----------
// O link ?convite=ABC234 chega antes do login: guardamos o código para usar depois dele
const conviteNaUrl = new URLSearchParams(window.location.search).get('convite');
if (conviteNaUrl) {
  guardar(CHAVE_CONVITE, conviteNaUrl.replace(/\s/g, '').toUpperCase());
  history.replaceState(null, '', window.location.pathname);
}

async function entrarPeloConvitePendente() {
  const codigo = ler(CHAVE_CONVITE);
  if (!codigo) return null;
  remover(CHAVE_CONVITE);

  try {
    return await entrarNoGrupo(codigo);
  } catch (erro) {
    console.error(erro);
    msgGrupos.textContent = mensagemDeErro(erro, 'Não foi possível usar o convite.');
    return null;
  }
}

// ---------- Login ----------
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
botaoSairGrupos.addEventListener('click', () => sair());

// ---------- Grupos ----------
async function carregarGrupos() {
  try {
    meusGrupos = await listarMeusGrupos();
    desenharMeusGrupos();
  } catch (erro) {
    console.error(erro);
    msgGrupos.textContent = 'Não foi possível carregar seus grupos.';
  }
}

function desenharMeusGrupos() {
  if (!meusGrupos.length) {
    listaGrupos.replaceChildren(
      criarTextoVazio('Você ainda não está em nenhum grupo. Crie um ou entre com um código.')
    );
    return;
  }

  listaGrupos.replaceChildren(
    ...meusGrupos.map((grupo) => {
      const botao = document.createElement('button');
      botao.className = 'grupo-item';

      const nome = document.createElement('span');
      nome.textContent = grupo.nome;

      const papel = document.createElement('small');
      papel.textContent = grupo.papel === 'admin' ? 'Admin' : 'Membro';

      botao.append(nome, papel);
      botao.addEventListener('click', () => abrirGrupo(grupo));
      return botao;
    })
  );
}

async function abrirGrupo(grupo) {
  grupoAtual = grupo;
  guardar(CHAVE_GRUPO, grupo.id);

  nomeDoGrupo.textContent = grupo.nome;
  codigoDoGrupo.textContent = grupo.codigo;
  botaoNovoCodigo.classList.toggle('hidden', grupo.papel !== 'admin');
  botaoApagarGrupo.classList.toggle('hidden', grupo.papel !== 'admin');
  opcoesGrupo.open = false;
  msg.textContent = '';
  lista.replaceChildren();

  mostrarTela('principal');
  await atualizarLista();
  // Qualquer mudança no banco refaz a lista, sem precisar do payload
  ouvirMudancas(atualizarLista);
  iniciarTemporizador();
}

async function voltarParaGrupos() {
  pararDeOuvir();
  pararTemporizador();
  grupoAtual = null;
  remover(CHAVE_GRUPO);
  msgGrupos.textContent = '';
  mostrarTela('grupos');
  await carregarGrupos();
}

botaoTrocarGrupo.addEventListener('click', () => voltarParaGrupos());

botaoCriarGrupo.addEventListener('click', async () => {
  const nome = campoNomeGrupo.value.trim();
  if (nome.length < 2) {
    msgGrupos.textContent = 'Dê um nome ao grupo (mínimo 2 letras).';
    return;
  }

  botaoCriarGrupo.disabled = true;
  msgGrupos.textContent = '';
  try {
    const novo = await criarGrupo(nome);
    campoNomeGrupo.value = '';
    await carregarGrupos();
    const grupo = meusGrupos.find((g) => g.id === novo.id);
    if (grupo) await abrirGrupo(grupo);
  } catch (erro) {
    console.error(erro);
    msgGrupos.textContent = mensagemDeErro(erro, 'Não foi possível criar o grupo.');
  } finally {
    botaoCriarGrupo.disabled = false;
  }
});

botaoEntrarGrupo.addEventListener('click', async () => {
  const codigo = campoCodigo.value.replace(/\s/g, '').toUpperCase();
  if (codigo.length !== 6) {
    msgGrupos.textContent = 'O código tem 6 caracteres.';
    return;
  }

  botaoEntrarGrupo.disabled = true;
  msgGrupos.textContent = '';
  try {
    const grupoId = await entrarNoGrupo(codigo);
    campoCodigo.value = '';
    await carregarGrupos();
    const grupo = meusGrupos.find((g) => g.id === grupoId);
    if (grupo) await abrirGrupo(grupo);
  } catch (erro) {
    console.error(erro);
    msgGrupos.textContent = mensagemDeErro(erro, 'Não foi possível entrar no grupo.');
  } finally {
    botaoEntrarGrupo.disabled = false;
  }
});

// ---------- Opções do grupo ----------
botaoConvidar.addEventListener('click', async () => {
  if (!grupoAtual) return;

  const link = `${window.location.origin}${window.location.pathname}?convite=${grupoAtual.codigo}`;
  const texto = `Entra no grupo "${grupoAtual.nome}" no Botão da Resenha. Código: ${grupoAtual.codigo}`;

  try {
    if (navigator.share) {
      await navigator.share({ title: 'Botão da Resenha', text: texto, url: link });
      return;
    }
    await navigator.clipboard.writeText(`${texto}\n${link}`);
    msg.textContent = 'Convite copiado.';
  } catch (erro) {
    if (erro?.name === 'AbortError') return; // cancelou o compartilhamento
    prompt('Copie o convite:', `${texto}\n${link}`);
  }
});

botaoNovoCodigo.addEventListener('click', async () => {
  if (!grupoAtual) return;
  const aviso =
    'Gerar um novo código? O código antigo deixa de funcionar, mas quem já entrou continua no grupo.';
  if (!confirm(aviso)) return;

  try {
    const novo = await gerarNovoCodigo(grupoAtual.id);
    grupoAtual.codigo = novo;
    codigoDoGrupo.textContent = novo;
    msg.textContent = 'Novo código gerado.';
  } catch (erro) {
    console.error(erro);
    msg.textContent = mensagemDeErro(erro, 'Não foi possível gerar um novo código.');
  }
});

botaoSairDoGrupo.addEventListener('click', async () => {
  if (!grupoAtual) return;
  if (!confirm(`Sair do grupo "${grupoAtual.nome}"?`)) return;

  try {
    await sairDoGrupo(grupoAtual.id);
    await voltarParaGrupos();
  } catch (erro) {
    console.error(erro);
    msg.textContent = mensagemDeErro(erro, 'Não foi possível sair do grupo.');
  }
});

botaoApagarGrupo.addEventListener('click', async () => {
  if (!grupoAtual) return;
  const aviso = `Apagar o grupo "${grupoAtual.nome}"? As resenhas e os membros saem junto. Isso não tem volta.`;
  if (!confirm(aviso)) return;

  try {
    await apagarGrupo(grupoAtual.id);
    await voltarParaGrupos();
  } catch (erro) {
    console.error(erro);
    msg.textContent = mensagemDeErro(erro, 'Não foi possível apagar o grupo.');
  }
});

// ---------- Resenhas ----------
botaoChamar.addEventListener('click', async () => {
  if (!grupoAtual) return;

  botaoChamar.disabled = true;
  msg.textContent = '';
  try {
    await criarResenha(grupoAtual.id);
    msg.textContent = 'Resenha chamada!';
  } catch (erro) {
    console.error(erro);
    // O banco avisa quando o limite foi atingido ("Aguarde X min...")
    msg.textContent = mensagemDeErro(erro, 'Não foi possível chamar a resenha.');
  } finally {
    botaoChamar.disabled = false;
  }
});

async function atualizarLista() {
  const grupo = grupoAtual;
  if (!grupo) return;

  try {
    const resenhas = await listarResenhas(grupo.id);
    if (grupo !== grupoAtual) return; // trocou de grupo durante a busca

    if (!resenhas.length) {
      lista.replaceChildren(criarTextoVazio('Nenhuma resenha ativa. Que tal chamar uma?'));
      return;
    }
    lista.replaceChildren(...resenhas.map(desenharResenha));
  } catch (erro) {
    console.error(erro);
    msg.textContent = 'Não foi possível carregar as resenhas.';
  }
}

function desenharResenha(resenha) {
  const ehCriador = Boolean(usuarioAtual) && resenha.criado_por === usuarioAtual.id;

  const card = document.createElement('div');
  card.className = 'card';

  const titulo = document.createElement('strong');
  titulo.textContent = ehCriador
    ? 'Você chamou a resenha'
    : `${resenha.perfis?.nome ?? 'Alguém'} chamou a resenha`;
  card.append(titulo);

  if (resenha.expira_em) {
    const validade = document.createElement('small');
    validade.className = 'validade';
    validade.textContent = `Some às ${formatarHora(resenha.expira_em)}`;
    card.append(validade);
  }

  const respostas = document.createElement('ul');
  for (const r of resenha.respostas) {
    const item = document.createElement('li');
    const texto = TEXTO_RESPOSTA[r.resposta] ?? r.resposta;
    const horario = r.horario_sugerido ? ` (${r.horario_sugerido})` : '';
    item.textContent = `${r.perfis?.nome ?? 'Membro'}: ${texto}${horario}`;
    respostas.append(item);
  }
  card.append(respostas);

  const botoes = ehCriador
    ? BOTOES_RESPOSTA.filter(({ valor }) => RESPOSTAS_DO_CRIADOR.includes(valor))
    : BOTOES_RESPOSTA;

  for (const { valor, rotulo } of botoes) {
    const botao = document.createElement('button');
    botao.textContent = rotulo;
    if (valor === 'aceito') botao.classList.add('principal');
    botao.addEventListener('click', () => responder(resenha.id, valor));
    card.append(botao);
  }

  // Só quem chamou a resenha pode apagá-la
  if (ehCriador) {
    const botaoApagar = document.createElement('button');
    botaoApagar.className = 'apagar';
    botaoApagar.textContent = '🗑️ Apagar resenha';
    botaoApagar.addEventListener('click', () => apagar(resenha.id));
    card.append(botaoApagar);
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

async function apagar(resenhaId) {
  if (!confirm('Apagar esta resenha? As respostas também serão apagadas.')) return;
  try {
    await apagarResenha(resenhaId);
    msg.textContent = 'Resenha apagada.';
    await atualizarLista();
  } catch (erro) {
    console.error(erro);
    msg.textContent = 'Não foi possível apagar a resenha.';
  }
}

// ---------- Atualização automática ----------
function iniciarTemporizador() {
  pararTemporizador();
  temporizador = setInterval(atualizarLista, INTERVALO_ATUALIZACAO);
}

function pararTemporizador() {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}

// Ao voltar para o app (celular), atualiza para tirar o que já expirou
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && grupoAtual) atualizarLista();
});

// ---------- Sessão ----------
async function iniciarSessao() {
  msgGrupos.textContent = '';
  mostrarTela('grupos');

  const grupoDoConvite = await entrarPeloConvitePendente();
  await carregarGrupos();

  const idSalvo = grupoDoConvite ?? ler(CHAVE_GRUPO);
  const alvo =
    meusGrupos.find((g) => g.id === idSalvo) ??
    (meusGrupos.length === 1 ? meusGrupos[0] : null);

  if (alvo) await abrirGrupo(alvo);
}

// Mostra a tela certa conforme o login. O Supabase pode repetir o aviso para o mesmo
// usuário (ao voltar para a aba, por exemplo): nesse caso não reiniciamos nada.
quandoMudarLogin(async (usuario) => {
  const mudouDeUsuario = usuario?.id !== usuarioAtual?.id;
  usuarioAtual = usuario ?? null;

  if (!usuario) {
    pararDeOuvir();
    pararTemporizador();
    grupoAtual = null;
    meusGrupos = [];
    mostrarTela('login');
    return;
  }

  if (mudouDeUsuario) await iniciarSessao();
});