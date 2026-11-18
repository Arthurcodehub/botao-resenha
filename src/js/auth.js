// src/js/auth.js
// Cuida de entrar e sair. Nenhuma outra parte do app mexe em login diretamente.

import { supabase } from './supabase.js';

export async function enviarLinkMagico(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });

  if (error) throw error;
}

export async function sair() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function usuarioAtual() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

// Chama a função sempre que o estado de login mudar (entrou, saiu, voltou do link)
export function quandoMudarLogin(callback) {
  supabase.auth.onAuthStateChange((evento, sessao) => {
    callback(sessao?.user ?? null);
  });
}