// src/js/realtime.js
// Escuta mudanças em resenhas e respostas e avisa o app para atualizar a lista.

import { supabase } from './supabase.js';

let canal = null;

// Chama aoMudar sempre que alguém cria uma resenha ou responde
export function ouvirMudancas(aoMudar) {
  pararDeOuvir(); // evita dois canais abertos ao mesmo tempo

  canal = supabase
    .channel('botao-resenha')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'resenhas' }, aoMudar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'respostas' }, aoMudar)
    .subscribe();
}

export function pararDeOuvir() {
  if (canal) {
    supabase.removeChannel(canal);
    canal = null;
  }
}