// src/js/resenhas.js
// Criar resenhas, responder e listar. Quem decide o que pode é o RLS no banco.

import { supabase } from './supabase.js';
import { usuarioAtual } from './auth.js';

// Cria uma resenha em nome do usuário logado
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

// Lista as resenhas recentes, com quem criou e as respostas de cada membro
export async function listarResenhas(limite = 20) {
  const { data, error } = await supabase
    .from('resenhas')
    .select(`
      id,
      criada_em,
      criado_por,
      perfis!criado_por ( nome ),
      respostas (
        resposta,
        horario_sugerido,
        membro_id,
        perfis ( nome )
      )
    `)
    .order('criada_em', { ascending: false })
    .limit(limite);

  if (error) throw error;
  return data;
}