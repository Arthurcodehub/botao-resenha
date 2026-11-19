-- 1) Log de criacao: permite limite em janela deslizante (nao some ao apagar a resenha)
create table if not exists public.log_resenhas (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  criada_em timestamptz not null default now()
);
create index if not exists idx_log_resenhas_usuario_data
  on public.log_resenhas (usuario_id, criada_em);

alter table public.log_resenhas enable row level security;
revoke all on public.log_resenhas from anon, authenticated;

-- 2) Limite: ate 3 resenhas a cada 30 min por usuario (substitui o intervalo de 10 min)
create or replace function public.limitar_resenhas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  maximo int := 3;
  janela interval := interval '30 minutes';
  total int;
  mais_antiga timestamptz;
  restante int;
begin
  -- serializa cliques simultaneos do mesmo usuario
  perform pg_advisory_xact_lock(hashtextextended(new.criado_por::text, 0));

  select count(*), min(criada_em) into total, mais_antiga
    from public.log_resenhas
    where usuario_id = new.criado_por and criada_em > now() - janela;

  if total >= maximo then
    restante := greatest(1, ceil(extract(epoch from (mais_antiga + janela - now())) / 60));
    raise exception 'Aguarde % min: limite de % resenhas a cada 30 min', restante, maximo;
  end if;

  insert into public.log_resenhas (usuario_id) values (new.criado_por);
  new.expira_em := now() + interval '12 hours';
  return new;
end $$;

revoke all on function public.limitar_resenhas() from public, anon, authenticated;

-- coluna do limite antigo nao e mais usada
alter table public.perfis drop column if exists ultima_resenha_em;

-- 3) Limpeza diaria do log
select cron.unschedule(jobid) from cron.job where jobname = 'limpar-log-resenhas';
select cron.schedule(
  'limpar-log-resenhas',
  '0 3 * * *',
  $$delete from public.log_resenhas where criada_em < now() - interval '1 day'$$
);

-- 4) Quem criou a resenha nao aceita nem recusa a propria (so pode sugerir outro horario)
drop policy if exists "membro responde em seu nome" on public.respostas;
create policy "membro responde em seu nome"
  on public.respostas for insert to authenticated
  with check (
    (select auth.uid()) = membro_id
    and exists (select 1 from public.resenhas r where r.id = respostas.resenha_id)
    and not exists (
      select 1 from public.resenhas r
      where r.id = respostas.resenha_id
        and r.criado_por = (select auth.uid())
        and respostas.resposta <> 'outro_horario'
    )
  );

drop policy if exists "membro altera so a propria resposta" on public.respostas;
create policy "membro altera so a propria resposta"
  on public.respostas for update to authenticated
  using ((select auth.uid()) = membro_id)
  with check (
    (select auth.uid()) = membro_id
    and exists (select 1 from public.resenhas r where r.id = respostas.resenha_id)
    and not exists (
      select 1 from public.resenhas r
      where r.id = respostas.resenha_id
        and r.criado_por = (select auth.uid())
        and respostas.resposta <> 'outro_horario'
    )
  );

-- 5) Limpa respostas antigas do proprio criador (aceito/recusado) que violam a nova regra
delete from public.respostas x
using public.resenhas r
where r.id = x.resenha_id
  and r.criado_por = x.membro_id
  and x.resposta <> 'outro_horario';