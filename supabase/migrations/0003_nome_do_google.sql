-- Nome inicial do perfil: o nome completo do Google.
-- Se o Google não enviar, usa o nome antes do @ do e-mail.
create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, nome)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

-- A função continua fechada para a API: só o trigger a executa
revoke execute on function public.criar_perfil() from public, anon, authenticated;