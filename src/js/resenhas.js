// src/js/resenhas.js
// Criar resenhas, responder, apagar e listar. Quem decide o que pode é o RLS no banco.

import { supabase } from './supabase.js';
import { usuarioAtual } from './auth.js';

// Cria uma resenha em nome do usuário logado.
// O banco recusa se o limite de 10 min foi atingido (erro "Aguarde X min...").
export async function criarResenha() {
  const usuario = await usuarioAtual();
  if (!usuario) throw new Error('Você precisa estar logado.');

  const { data, error } = await supabase
    .from('resenhas')
    .insert({ criado_por: usuario.id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Registra a resposta do usuário logado para uma resenha.
// Se ele já respondeu antes, a resposta é atualizada, não duplicada.
export async function responderResenha(resenhaId, resposta, horarioSugerido = null) {
  const usuario = await usuarioAtual();
  if (!usuario) throw new Error('Você precisa estar logado.');

  const { error } = await supabase
    .from('respostas')
    .upsert(
      {
        resenha_id: resenhaId,
        membro_id: usuario.id,
        resposta,
        horario_sugerido: resposta === 'outro_horario' ? horarioSugerido : null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'resenha_id,membro_id' }
    );

  if (error) throw error;
}

// Apaga uma resenha (e as respostas dela, por cascade).
// O RLS só permite apagar as suas; se não for sua, nada é apagado e damos erro.
export async function apagarResenha(resenhaId) {
  const { data, error } = await supabase
    .from('resenhas')
    .delete()
    .eq('id', resenhaId)
    .select('id');

  if (error) throw error;
  if (!data?.length) throw new Error('Resenha não encontrada ou sem permissão.');
}

// Lista as resenhas ativas, com quem criou e as respostas de cada membro.
// As expiradas não chegam aqui: o RLS já as esconde.
export async function listarResenhas(limite = 20) {
  const { data, error } = await supabase
    .from('resenhas')
    .select('id, criado_por, criada_em, expira_em, perfis(nome), respostas(resposta, horario_sugerido, perfis(nome))')
    .order('criada_em', { ascending: false })
    .limit(limite);

  if (error) throw error;
  return data;
}