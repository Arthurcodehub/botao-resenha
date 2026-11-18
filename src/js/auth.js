]// src/js/auth.js
// Cuida de entrar e sair. Nenhuma outra parte do app mexe em login diretamente.

import { supabase } from './supabase.js';

// Login com Google: o usuário é levado ao Google e volta para o site já logado
export async function entrarComGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
    },
  });

  if (error) throw error;
}

// Login por link mágico (mantido como alternativa)
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

// Chama a função sempre que o estado de login mudar (entrou, saiu, voltou do login)
export function quandoMudarLogin(callback) {
  supabase.auth.onAuthStateChange((evento, sessao) => {
    callback(sessao?.user ?? null);
  });
}