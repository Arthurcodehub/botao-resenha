// src/js/push.js
// Pede permissão e cria a inscrição de push neste aparelho. Ainda não salva nada no banco.

// Chave PÚBLICA do VAPID. Não é segredo.
const VAPID_PUBLIC_KEY = 'BFZTuEOE1x2oVqwhDZ3Nw46ruC8wliLG45poJSubDVeRxdBmodrqSjxDif5xg4ur_fUNYenJcNP53k6_k0AKY98';

export function suportaPush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Converte a chave base64url para o formato que o navegador exige
function chaveParaBytes(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const texto = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(texto, (c) => c.charCodeAt(0));
}

export async function ativarPush() {
  if (!suportaPush()) {
    throw new Error('Este navegador não suporta notificações. No iPhone, abra o app pela tela inicial.');
  }

  // Precisa vir de um toque do usuário
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') {
    throw new Error('Permissão de notificação negada.');
  }

  const registro = await navigator.serviceWorker.ready;

  let inscricao = await registro.pushManager.getSubscription();
  if (!inscricao) {
    inscricao = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chaveParaBytes(VAPID_PUBLIC_KEY),
    });
  }

  return inscricao;
}