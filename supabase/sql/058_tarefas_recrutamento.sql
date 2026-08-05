-- Reconstruido a partir da BD real (migration remota 20260724134736_tarefas_recrutamento)
-- Nao existia ficheiro local correspondente no repo; ver nota no commit desta reconstrucao.

create table if not exists public.tarefas_recrutamento (
  id bigint generated always as identity primary key,
  title text not null,
  restaurant_name text,
  contact_person text,
  phone text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  notes text,
  assigned_to text,
  completed_at timestamptz,
  criado_por integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.tarefas_recrutamento enable row level security;
-- Sem policies: acesso exclusivamente via RPCs SECURITY DEFINER abaixo (so admin).

create or replace function public.admin_list_recruitment_tasks(caller_user_id integer)
returns setof public.tarefas_recrutamento
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  if not public.is_platform_admin(caller_user_id) then
    raise exception 'Apenas administradores podem gerir tarefas.' using errcode = '42501';
  end if;

  return query select * from public.tarefas_recrutamento order by criado_em desc;
end;
$function$;

create or replace function public.admin_upsert_recruitment_task(
  caller_user_id integer,
  task_id_input bigint,
  title_input text,
  restaurant_name_input text default null,
  contact_person_input text default null,
  phone_input text default null,
  status_input text default 'todo',
  priority_input text default 'medium',
  due_date_input date default null,
  notes_input text default null,
  assigned_to_input text default null
)
returns public.tarefas_recrutamento
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_task public.tarefas_recrutamento;
  v_completed_at timestamptz;
begin
  if not public.is_platform_admin(caller_user_id) then
    raise exception 'Apenas administradores podem gerir tarefas.' using errcode = '42501';
  end if;

  if title_input is null or trim(title_input) = '' then
    raise exception 'O titulo da tarefa e obrigatorio.' using errcode = '22023';
  end if;

  v_completed_at := case when status_input = 'done' then now() else null end;

  if task_id_input is null then
    insert into public.tarefas_recrutamento (
      title, restaurant_name, contact_person, phone, status, priority,
      due_date, notes, assigned_to, completed_at, criado_por
    ) values (
      trim(title_input), nullif(trim(restaurant_name_input), ''), nullif(trim(contact_person_input), ''),
      nullif(trim(phone_input), ''), coalesce(status_input, 'todo'), coalesce(priority_input, 'medium'),
      due_date_input, nullif(trim(notes_input), ''), nullif(trim(assigned_to_input), ''), v_completed_at, caller_user_id
    )
    returning * into v_task;
  else
    update public.tarefas_recrutamento set
      title = trim(title_input),
      restaurant_name = nullif(trim(restaurant_name_input), ''),
      contact_person = nullif(trim(contact_person_input), ''),
      phone = nullif(trim(phone_input), ''),
      status = coalesce(status_input, status),
      priority = coalesce(priority_input, priority),
      due_date = due_date_input,
      notes = nullif(trim(notes_input), ''),
      assigned_to = nullif(trim(assigned_to_input), ''),
      completed_at = case when status_input = 'done' then coalesce(completed_at, now()) else null end,
      atualizado_em = now()
    where id = task_id_input
    returning * into v_task;

    if v_task.id is null then
      raise exception 'Tarefa nao encontrada.' using errcode = 'P0002';
    end if;
  end if;

  return v_task;
end;
$function$;

create or replace function public.admin_delete_recruitment_task(caller_user_id integer, task_id_input bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  if not public.is_platform_admin(caller_user_id) then
    raise exception 'Apenas administradores podem gerir tarefas.' using errcode = '42501';
  end if;

  delete from public.tarefas_recrutamento where id = task_id_input;
end;
$function$;

grant execute on function public.admin_list_recruitment_tasks(integer) to anon, authenticated;
grant execute on function public.admin_upsert_recruitment_task(integer, bigint, text, text, text, text, text, text, date, text, text) to anon, authenticated;
grant execute on function public.admin_delete_recruitment_task(integer, bigint) to anon, authenticated;
