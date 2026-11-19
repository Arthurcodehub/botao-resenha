-- 1) Colunas: expiracao da resenha e controle de intervalo por usuario
alter table public.resenhas
  add column if not exists expira_em timestamptz not null default (now() + interval '12 hours');
update public.resenhas set expira_em = criada_em + interval '12 hours';

alter table public.perfis add column if not exists ultima_resenha_em timestamptz;
update public.perfis p
  set ultima_resenha_em = (select max(r.criada_em) from public.resenhas r where r.criado_por = p.id);

-- 2) Limite: 1 resenha a cada 10 min por usuario; expiracao fixada no servidor (12 h)
create or replace function public.limitar_resenhas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ultima timestamptz;
  espera interval := interval '10 minutes';
  restante int;
begin
  select ultima_resenha_em into ultima
    from public.perfis where id = new.criado_por for update;

  if ultima is not null and ultima > now() - espera then
    restante := ceil(extract(epoch from (ultima + espera - now())) / 60);
    raise exception 'Aguarde % min para chamar outra resenha', restante;
  end if;

  update public.perfis set ultima_resenha_em = now() where id = new.criado_por;
  new.expira_em := now() + interval '12 hours';
  return new;
end $$;

revoke all on function public.limitar_resenhas() from public, anon, authenticated;

drop trigger if exists trg_limitar_resenhas on public.resenhas;
create trigger trg_limitar_resenhas
  before insert on public.resenhas
  for each row execute function public.limitar_resenhas();

-- 3) Leitura: resenhas expiradas somem para todos
drop policy if exists "membros leem resenhas" on public.resenhas;
drop policy if exists "membros leem resenhas ativas" on public.resenhas;
create policy "membros leem resenhas ativas"
  on public.resenhas for select to authenticated
  using (expira_em > now());

-- 4) Quem criou pode apagar a propria resenha (respostas saem junto por cascade)
drop policy if exists "criador apaga a propria resenha" on public.resenhas;
create policy "criador apaga a propria resenha"
  on public.resenhas for delete to authenticated
  using ((select auth.uid()) = criado_por);

-- 5) Respostas acompanham a visibilidade da resenha
drop policy if exists "membros leem respostas" on public.respostas;
create policy "membros leem respostas"
  on public.respostas for select to authenticated
  using (exists (select 1 from public.resenhas r where r.id = resenha_id));

drop policy if exists "membro responde em seu nome" on public.respostas;
create policy "membro responde em seu nome"
  on public.respostas for insert to authenticated
  with check (
    (select auth.uid()) = membro_id
    and exists (select 1 from public.resenhas r where r.id = resenha_id)
  );

drop policy if exists "membro altera so a propria resposta" on public.respostas;
create policy "membro altera so a propria resposta"
  on public.respostas for update to authenticated
  using ((select auth.uid()) = membro_id)
  with check (
    (select auth.uid()) = membro_id
    and exists (select 1 from public.resenhas r where r.id = resenha_id)
  );

-- 6) Limpeza fisica das expiradas, de hora em hora
create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid) from cron.job where jobname = 'limpar-resenhas-expiradas';
select cron.schedule(
  'limpar-resenhas-expiradas',
  '0 * * * *',
  $$delete from public.resenhas where expira_em < now()$$
);