-- A função só deve ser disparada pelo trigger, nunca chamada pela API
revoke execute on function public.criar_perfil() from public, anon, authenticated;