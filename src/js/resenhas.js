// src/js/resenhas.js
// Criar resenhas, responder, apagar e listar. Quem decide o que pode é o RLS no banco.

import { supabase } from './supabase.js';
import { usuarioAtual } from './auth.js';

// Cria uma resenha em nome do usuário logado, dentro de um grupo dele.
// O banco recusa se o limite (3 a cada 30 min) foi atingido.
export async function criarResenha(grupoId) {
  const usuario = await usuarioAtual();
  if (!usuario) throw new Error('Você precisa estar logado.');

  const { data, error } = await supabase
    .from('resenhas')
    .insert({ criado_por: usuario.id, grupo_id: grupoId })
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

// Lista as resenhas ativas de um grupo, com quem criou e as respostas de cada membro.
// As expiradas não chegam aqui: o RLS já as esconde.
// perfis!criado_por diz qual relacionamento usar (resenhas também chega em perfis via respostas).
export async function listarResenhas(grupoId, limite = 20) {
  const { data, error } = await supabase
    .from('resenhas')
    .select(
      'id, criada_em, expira_em, criado_por, perfis!criado_por(nome), respostas(resposta, horario_sugerido, membro_id, perfis(nome))'
    )
    .eq('grupo_id', grupoId)
    .order('criada_em', { ascending: false })
    .limit(limite);

  if (error) throw error;
  return data;
}