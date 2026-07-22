import { supabase } from "./supabaseClient";

function toInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function unwrap({ data, error }, context) {
  if (error) {
    console.error(`customerPushService: ${context}`, { error: error?.message || String(error) });
    throw error;
  }
  return data;
}

export async function saveCustomerPushSubscription(callerUserId, subscription) {
  const response = await supabase.rpc("customer_save_push_subscription", {
    caller_user_id: toInt(callerUserId),
    subscription_input: subscription,
  });
  return unwrap(response, "saveCustomerPushSubscription");
}

export async function removeCustomerPushSubscription(callerUserId, endpoint) {
  const response = await supabase.rpc("customer_remove_push_subscription", {
    caller_user_id: toInt(callerUserId),
    endpoint_input: endpoint,
  });
  return unwrap(response, "removeCustomerPushSubscription");
}
