-- 1) Policies: auth.uid() avaliado uma vez por query (initplan)
drop policy if exists "membro cria resenha em seu nome" on public.resenhas;
create policy "membro cria resenha em seu nome"
  on public.resenhas for insert to authenticated
  with check ((select auth.uid()) = criado_por);

drop policy if exists "membro responde em seu nome" on public.respostas;
create policy "membro responde em seu nome"
  on public.respostas for insert to authenticated
  with check ((select auth.uid()) = membro_id);

drop policy if exists "membro altera so a propria resposta" on public.respostas;
create policy "membro altera so a propria resposta"
  on public.respostas for update to authenticated
  using ((select auth.uid()) = membro_id)
  with check ((select auth.uid()) = membro_id);

-- 2) Indices nas chaves estrangeiras
create index if not exists idx_resenhas_criado_por on public.resenhas (criado_por);
create index if not exists idx_respostas_membro_id on public.respostas (membro_id);

-- 3) Grants: anon nao usa nada; authenticated nao precisa de privilegios de estrutura
revoke all on public.perfis, public.resenhas, public.respostas from anon;
revoke truncate, references, trigger on public.perfis, public.resenhas, public.respostas from authenticated;

-- 4) Limite de tamanho para o horario sugerido
alter table public.respostas drop constraint if exists respostas_horario_sugerido_tamanho;
alter table public.respostas
  add constraint respostas_horario_sugerido_tamanho
  check (horario_sugerido is null or length(horario_sugerido) <= 50);