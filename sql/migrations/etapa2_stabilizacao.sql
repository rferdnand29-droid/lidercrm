-- Etapa 2 — estabilização de documentos mutáveis
--
-- Aplicar no projeto Supabase da aplicação depois de revisar as policies.
-- O Worker chama esta função pelo endpoint /rest/v1/rpc/kanban_move_card.
-- Ela não é executada automaticamente pelo artifact.

create or replace function public.kanban_move_card(
  p_from_path text,
  p_to_path text,
  p_card_id text,
  p_to_user_id text,
  p_expected_from_version timestamptz default null,
  p_expected_to_version timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  from_row public.fs_documents%rowtype;
  to_row public.fs_documents%rowtype;
  from_list jsonb;
  to_list jsonb;
  card jsonb;
  claimed jsonb;
  idx integer := 0;
  found_idx integer := null;
  from_version timestamptz;
  to_version timestamptz;
begin
  if p_from_path is null or p_to_path is null or p_card_id is null
     or p_to_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT');
  end if;

  -- Ordem fixa dos locks evita deadlock quando duas pessoas reivindicam
  -- cards em boards cruzados ao mesmo tempo.
  if p_from_path < p_to_path then
    select * into from_row from public.fs_documents
      where path = p_from_path for update;
    select * into to_row from public.fs_documents
      where path = p_to_path for update;
  else
    select * into to_row from public.fs_documents
      where path = p_to_path for update;
    select * into from_row from public.fs_documents
      where path = p_from_path for update;
  end if;

  if from_row.path is null then
    return jsonb_build_object('ok', false, 'code', 'SOURCE_NOT_FOUND');
  end if;

  from_version := from_row.updated_at;
  to_version := to_row.updated_at;
  if p_expected_from_version is not null
     and from_version is distinct from p_expected_from_version then
    return jsonb_build_object(
      'ok', false, 'code', 'VERSION_CONFLICT',
      'server_version', from_version
    );
  end if;
  if p_expected_to_version is not null
     and to_version is distinct from p_expected_to_version then
    return jsonb_build_object(
      'ok', false, 'code', 'VERSION_CONFLICT',
      'server_version', to_version
    );
  end if;

  from_list := coalesce(from_row.data -> 'list', '[]'::jsonb);
  to_list := coalesce(to_row.data -> 'list', '[]'::jsonb);
  for card in select value from jsonb_array_elements(from_list) loop
    if card ->> 'id' = p_card_id then
      found_idx := idx;
      exit;
    end if;
    idx := idx + 1;
  end loop;

  if found_idx is null then
    return jsonb_build_object('ok', false, 'code', 'CARD_NOT_FOUND');
  end if;

  card := from_list -> found_idx;
  if coalesce(card ->> 'col', '') <> 'livre' then
    return jsonb_build_object('ok', false, 'code', 'NOT_LIVRE');
  end if;

  claimed := jsonb_set(card, '{userId}', to_jsonb(p_to_user_id), true);
  claimed := jsonb_set(claimed, '{updatedAt}', to_jsonb(now()::text), true);

  from_list := from_list - found_idx;
  to_list := (
    select coalesce(jsonb_agg(value), '[]'::jsonb)
    from jsonb_array_elements(to_list) as elements(value)
    where value ->> 'id' <> p_card_id
  ) || jsonb_build_array(claimed);

  update public.fs_documents
     set data = jsonb_set(coalesce(from_row.data, '{}'::jsonb), '{list}', from_list, true),
         updated_at = now()
   where path = p_from_path;

  if to_row.path is null then
    insert into public.fs_documents(path, parent_path, data, updated_at)
    values (p_to_path, regexp_replace(p_to_path, '/[^/]+$', ''),
            jsonb_build_object('list', to_list, 'ts', extract(epoch from now()) * 1000),
            now());
  else
    update public.fs_documents
       set data = jsonb_set(coalesce(to_row.data, '{}'::jsonb), '{list}', to_list, true),
           updated_at = now()
     where path = p_to_path;
  end if;

  select updated_at into from_version from public.fs_documents where path = p_from_path;
  select updated_at into to_version from public.fs_documents where path = p_to_path;
  return jsonb_build_object(
    'ok', true,
    'card', claimed,
    'source_version', from_version,
    'destination_version', to_version
  );
end;
$$;

revoke all on function public.kanban_move_card(text, text, text, text, timestamptz, timestamptz)
  from public;
grant execute on function public.kanban_move_card(text, text, text, text, timestamptz, timestamptz)
  to service_role;