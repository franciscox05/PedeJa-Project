import { supabase } from "./supabaseClient";

export async function fetchRecruitmentTasks(callerUserId) {
  const { data, error } = await supabase.rpc("admin_list_recruitment_tasks", {
    caller_user_id: Number(callerUserId),
  });
  if (error) throw error;
  return data || [];
}

export async function saveRecruitmentTask(callerUserId, taskId, form) {
  const { data, error } = await supabase.rpc("admin_upsert_recruitment_task", {
    caller_user_id: Number(callerUserId),
    task_id_input: taskId ?? null,
    title_input: form.title,
    restaurant_name_input: form.restaurant_name || null,
    contact_person_input: form.contact_person || null,
    phone_input: form.phone || null,
    status_input: form.status || "todo",
    priority_input: form.priority || "medium",
    due_date_input: form.due_date || null,
    notes_input: form.notes || null,
    assigned_to_input: form.assigned_to || null,
  });
  if (error) throw error;
  return data;
}

export async function deleteRecruitmentTask(callerUserId, taskId) {
  const { error } = await supabase.rpc("admin_delete_recruitment_task", {
    caller_user_id: Number(callerUserId),
    task_id_input: taskId,
  });
  if (error) throw error;
}
