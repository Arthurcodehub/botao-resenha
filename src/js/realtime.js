// src/js/realtime.js
// Escuta mudanças em resenhas e respostas e avisa o app para atualizar a lista.

import { supabase } from './supabase.js';

let canal = null;
let pausa = null;

// Junta vários eventos seguidos (ex.: cascade ao apagar) em uma só chamada
function agrupar(aoMudar) {
  return () => {
    clearTimeout(pausa);
    pausa = setTimeout(aoMudar, 300);
  };
}

// Chama aoMudar sempre que alguém cria, responde ou apaga uma resenha
export function ouvirMudancas(aoMudar) {
  pararDeOuvir(); // evita dois canais abertos ao mesmo tempo

  const aoMudarComPausa = agrupar(aoMudar);

  canal = supabase
    .channel('botao-resenha')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'resenhas' }, aoMudarComPausa)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'respostas' }, aoMudarComPausa)
    .subscribe();
}

export function pararDeOuvir() {
  clearTimeout(pausa);
  pausa = null;
  if (canal) {
    supabase.removeChannel(canal);
    canal = null;
  }
}