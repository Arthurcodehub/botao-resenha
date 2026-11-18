-- Perfis dos membros, ligados ao sistema de login
create table perfis (
  id uuid primary key references auth.users on delete cascade,
  nome text not null
);

-- Cada vez que alguém aperta "CHAMAR RESENHA"
create table resenhas (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid not null references perfis(id),
  criada_em timestamptz not null default now()
);

create type tipo_resposta as enum ('aceito', 'recusado', 'outro_horario');

-- Uma resposta por membro por resenha
create table respostas (
  resenha_id uuid references resenhas(id) on delete cascade,
  membro_id uuid references perfis(id) on delete cascade,
  resposta tipo_resposta not null,
  horario_sugerido text,
  atualizado_em timestamptz not null default now(),
  primary key (resenha_id, membro_id)
);

-- Cria o perfil automaticamente quando um usuário novo entra
create function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, nome)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_perfil();

-- Segurança: liga as regras de acesso em nível de linha
alter table perfis enable row level security;
alter table resenhas enable row level security;
alter table respostas enable row level security;

create policy "membros leem perfis" on perfis
  for select to authenticated using (true);

create policy "membros leem resenhas" on resenhas
  for select to authenticated using (true);

create policy "membro cria resenha em seu nome" on resenhas
  for insert to authenticated with check (auth.uid() = criado_por);

create policy "membros leem respostas" on respostas
  for select to authenticated using (true);

create policy "membro responde em seu nome" on respostas
  for insert to authenticated with check (auth.uid() = membro_id);

create policy "membro altera so a propria resposta" on respostas
  for update to authenticated
  using (auth.uid() = membro_id)
  with check (auth.uid() = membro_id);

-- Ativa o tempo real nas duas tabelas
alter publication supabase_realtime add table resenhas, respostas;