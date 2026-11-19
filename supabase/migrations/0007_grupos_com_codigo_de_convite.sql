-- 0) Schema privado: funcoes auxiliares de RLS ficam fora da API publica
create schema if not exists private;
grant usage on schema private to authenticated;

-- 1) Tabelas de grupos
create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 40),
  codigo text not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{6}$'),
  criado_em timestamptz not null default now()
);

create table if not exists public.membros (
  grupo_id uuid not null references public.grupos (id) on delete cascade,
  user_id uuid not null references public.perfis (id) on delete cascade,
  papel text not null default 'membro' check (papel in ('admin', 'membro')),
  entrou_em timestamptz not null default now(),
  primary key (grupo_id, user_id)
);
create index if not exists idx_membros_user_id on public.membros (user_id);

-- tentativas de entrar com codigo invalido (freio contra adivinhacao de codigo)
create table if not exists public.tentativas_convite (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  criada_em timestamptz not null default now()
);
create index if not exists idx_tentativas_convite_usuario_data
  on public.tentativas_convite (usuario_id, criada_em);

-- 2) Resenhas passam a pertencer a um grupo (as atuais sao de teste e expiram em 12 h)
delete from public.resenhas;
alter table public.resenhas
  add column if not exists grupo_id uuid references public.grupos (id) on delete cascade;
alter table public.resenhas alter column grupo_id set not null;
create index if not exists idx_resenhas_grupo_id on public.resenhas (grupo_id);

-- 3) Funcoes auxiliares (security definer evita recursao nas policies)
create or replace function private.eh_membro(p_grupo uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.membros m
    where m.grupo_id = p_grupo and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.divide_grupo(p_usuario uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.membros a
    join public.membros b on b.grupo_id = a.grupo_id
    where a.user_id = (select auth.uid()) and b.user_id = p_usuario
  );
$$;

-- codigo de 6 caracteres sem letras/numeros confusos (sem I, O, 0 e 1)
create or replace function private.gerar_codigo()
returns text
language plpgsql volatile set search_path = public
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  novo text;
  bytes bytea;
  i int;
begin
  loop
    novo := '';
    bytes := uuid_send(gen_random_uuid());
    for i in 0..5 loop
      novo := novo || substr(alfabeto, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.grupos g where g.codigo = novo);
  end loop;
  return novo;
end $$;

revoke all on function private.eh_membro(uuid), private.divide_grupo(uuid), private.gerar_codigo()
  from public, anon, authenticated;
grant execute on function private.eh_membro(uuid), private.divide_grupo(uuid) to authenticated;

-- 4) RLS e grants
alter table public.grupos enable row level security;
alter table public.membros enable row level security;
alter table public.tentativas_convite enable row level security;

revoke all on public.grupos, public.membros, public.tentativas_convite from anon, authenticated;
grant select on public.grupos, public.membros to authenticated;

drop policy if exists "membro ve seus grupos" on public.grupos;
create policy "membro ve seus grupos"
  on public.grupos for select to authenticated
  using (private.eh_membro(id));

drop policy if exists "membro ve os colegas de grupo" on public.membros;
create policy "membro ve os colegas de grupo"
  on public.membros for select to authenticated
  using (private.eh_membro(grupo_id));

-- perfis: so o proprio e de quem divide grupo; cliente nao escreve
drop policy if exists "membros leem perfis" on public.perfis;
drop policy if exists "ve o proprio perfil e de quem divide grupo" on public.perfis;
create policy "ve o proprio perfil e de quem divide grupo"
  on public.perfis for select to authenticated
  using (id = (select auth.uid()) or private.divide_grupo(id));
revoke insert, update, delete, truncate, references, trigger on public.perfis from authenticated;

-- resenhas: so dentro dos grupos do usuario
drop policy if exists "membros leem resenhas ativas" on public.resenhas;
create policy "membros leem resenhas ativas"
  on public.resenhas for select to authenticated
  using (expira_em > now() and private.eh_membro(grupo_id));

drop policy if exists "membro cria resenha em seu nome" on public.resenhas;
create policy "membro cria resenha em seu nome"
  on public.resenhas for insert to authenticated
  with check ((select auth.uid()) = criado_por and private.eh_membro(grupo_id));

-- 5) Funcoes chamadas pelo app (RPC)
create or replace function public.criar_grupo(p_nome text)
returns public.grupos
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  nome_limpo text := btrim(p_nome);
  novo public.grupos;
begin
  if uid is null then raise exception 'Você precisa estar logado'; end if;
  if nome_limpo is null or char_length(nome_limpo) < 2 or char_length(nome_limpo) > 40 then
    raise exception 'O nome do grupo precisa ter de 2 a 40 caracteres';
  end if;
  if (select count(*) from public.membros where user_id = uid) >= 10 then
    raise exception 'Você já participa de 10 grupos';
  end if;

  insert into public.grupos (nome, codigo)
    values (nome_limpo, private.gerar_codigo())
    returning * into novo;
  insert into public.membros (grupo_id, user_id, papel) values (novo.id, uid, 'admin');
  return novo;
end $$;

-- devolve o id do grupo, ou null se o codigo nao existe (a tentativa fica registrada)
create or replace function public.entrar_grupo(p_codigo text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cod text := upper(btrim(p_codigo));
  gid uuid;
  falhas int;
begin
  if uid is null then raise exception 'Você precisa estar logado'; end if;

  perform pg_advisory_xact_lock(hashtextextended('convite' || uid::text, 0));

  select count(*) into falhas from public.tentativas_convite
    where usuario_id = uid and criada_em > now() - interval '15 minutes';
  if falhas >= 5 then
    raise exception 'Aguarde 15 min: muitas tentativas com código inválido';
  end if;

  select id into gid from public.grupos where codigo = cod;
  if gid is null then
    insert into public.tentativas_convite (usuario_id) values (uid);
    return null;
  end if;

  if not exists (select 1 from public.membros where grupo_id = gid and user_id = uid)
     and (select count(*) from public.membros where user_id = uid) >= 10 then
    raise exception 'Você já participa de 10 grupos';
  end if;

  insert into public.membros (grupo_id, user_id) values (gid, uid) on conflict do nothing;
  return gid;
end $$;

create or replace function public.sair_do_grupo(p_grupo uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Você precisa estar logado'; end if;

  delete from public.membros where grupo_id = p_grupo and user_id = uid;
  if not found then return; end if;

  if not exists (select 1 from public.membros where grupo_id = p_grupo) then
    delete from public.grupos where id = p_grupo;
  elsif not exists (select 1 from public.membros where grupo_id = p_grupo and papel = 'admin') then
    update public.membros set papel = 'admin'
    where grupo_id = p_grupo
      and user_id = (
        select m.user_id from public.membros m
        where m.grupo_id = p_grupo
        order by m.entrou_em, m.user_id
        limit 1
      );
  end if;
end $$;

create or replace function public.novo_codigo_grupo(p_grupo uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  novo text;
begin
  if uid is null then raise exception 'Você precisa estar logado'; end if;
  if not exists (
    select 1 from public.membros
    where grupo_id = p_grupo and user_id = uid and papel = 'admin'
  ) then
    raise exception 'Só quem administra o grupo pode fazer isso';
  end if;

  update public.grupos set codigo = private.gerar_codigo()
    where id = p_grupo returning codigo into novo;
  return novo;
end $$;

create or replace function public.apagar_grupo(p_grupo uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Você precisa estar logado'; end if;
  if not exists (
    select 1 from public.membros
    where grupo_id = p_grupo and user_id = uid and papel = 'admin'
  ) then
    raise exception 'Só quem administra o grupo pode fazer isso';
  end if;

  delete from public.grupos where id = p_grupo;
end $$;

revoke all on function
  public.criar_grupo(text), public.entrar_grupo(text), public.sair_do_grupo(uuid),
  public.novo_codigo_grupo(uuid), public.apagar_grupo(uuid)
  from public, anon;
grant execute on function
  public.criar_grupo(text), public.entrar_grupo(text), public.sair_do_grupo(uuid),
  public.novo_codigo_grupo(uuid), public.apagar_grupo(uuid)
  to authenticated;

-- 6) Limpeza diaria das tentativas de convite
select cron.unschedule(jobid) from cron.job where jobname = 'limpar-tentativas-convite';
select cron.schedule(
  'limpar-tentativas-convite',
  '10 3 * * *',
  $$delete from public.tentativas_convite where criada_em < now() - interval '1 day'$$
);