import { useOutletContext } from "react-router-dom";
import { Bell, BellOff, BellRing } from "lucide-react";
import { useCustomerPushSubscription } from "../../hooks/useCustomerPushSubscription";
import { extractUserId } from "../../utils/roles";

export default function ProfileNotificacoes() {
  const { user } = useOutletContext();
  const push = useCustomerPushSubscription(extractUserId(user));

  if (!push.supported) {
    return (
      <div className="py-10 text-center">
        <BellOff className="mx-auto mb-3 h-12 w-12 text-gray-200" aria-hidden="true" />
        <p className="text-sm text-gray-500">
          O teu navegador ou dispositivo não suporta notificações push.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${
              push.subscribed ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {push.subscribed ? <BellRing className="h-5 w-5" aria-hidden="true" /> : <Bell className="h-5 w-5" aria-hidden="true" />}
          </div>
          <div>
            <p className="font-bold text-gray-900">Notificações de entrega</p>
            <p className="text-sm text-gray-500">
              Avisa-me quando um estafeta é atribuído e quando sai para a entrega.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={push.busy}
          onClick={() => (push.subscribed ? push.unsubscribe() : push.subscribe())}
          className={`flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-60 ${
            push.subscribed
              ? "border border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
              : "bg-[#e62429] text-white hover:bg-[#c91b20]"
          }`}
        >
          {push.busy ? "A atualizar..." : push.subscribed ? "Desativar" : "Ativar"}
        </button>
      </div>

      {push.permission === "denied" ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          As notificações estão bloqueadas nas definições do teu navegador para este site. Ativa-as
          nas permissões do site para poderes receber avisos.
        </p>
      ) : null}
    </div>
  );
}
