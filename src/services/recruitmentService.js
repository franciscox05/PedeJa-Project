import { supabase } from "./supabaseClient";

export async function fetchRecruitmentTasks(callerUserId) {
  const { data, error } = await supabase.rpc("admin_list_recruitment_tasks", {
    caller_user_id: Number(callerUserId),
  });
  if (error) throw error;
  return data || [];
}

export async function upsertRecruitmentTask(callerUserId, taskId, payload) {
  const { data, error } = await supabase.rpc("admin_upsert_recruitment_task", {
    caller_user_id: Number(callerUserId),
    task_id_input: taskId || null,
    title_input: payload.title,
    restaurant_name_input: payload.restaurant_name || null,
    contact_person_input: payload.contact_person || null,
    phone_input: payload.phone || null,
    status_input: payload.status || "todo",
    priority_input: payload.priority || "medium",
    due_date_input: payload.due_date || null,
    notes_input: payload.notes || null,
    assigned_to_input: payload.assigned_to || null,
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
