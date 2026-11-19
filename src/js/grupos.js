// src/js/grupos.js
// Criar grupo, entrar com código, sair e administrar. Quem decide o que pode é o banco.

import { supabase } from './supabase.js';
import { usuarioAtual } from './auth.js';

// Lista os grupos do usuário logado, com o papel dele em cada um
export async function listarMeusGrupos() {
  const usuario = await usuarioAtual();
  if (!usuario) throw new Error('Você precisa estar logado.');

  const { data, error } = await supabase
    .from('membros')
    .select('papel, grupos(id, nome, codigo)')
    .eq('user_id', usuario.id)
    .order('entrou_em', { ascending: true });

  if (error) throw error;
  return data.filter((m) => m.grupos).map((m) => ({ ...m.grupos, papel: m.papel }));
}

// Cria o grupo; quem cria vira admin
export async function criarGrupo(nome) {
  const { data, error } = await supabase.rpc('criar_grupo', { p_nome: nome });
  if (error) throw error;
  return data;
}

// Entra com o código de convite e devolve o id do grupo
export async function entrarNoGrupo(codigo) {
  const { data, error } = await supabase.rpc('entrar_grupo', { p_codigo: codigo });
  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error('Código inválido. Confira e tente de novo.'), {
      amigavel: true,
    });
  }
  return data;
}

export async function sairDoGrupo(grupoId) {
  const { error } = await supabase.rpc('sair_do_grupo', { p_grupo: grupoId });
  if (error) throw error;
}

// Só admin. O código antigo deixa de funcionar; quem já entrou continua no grupo.
export async function gerarNovoCodigo(grupoId) {
  const { data, error } = await supabase.rpc('novo_codigo_grupo', { p_grupo: grupoId });
  if (error) throw error;
  return data;
}

// Só admin. Apaga o grupo, as resenhas e as respostas dele.
export async function apagarGrupo(grupoId) {
  const { error } = await supabase.rpc('apagar_grupo', { p_grupo: grupoId });
  if (error) throw error;
}