import { useState } from "react";
import { ExternalLink, ChevronDown, HelpCircle } from "lucide-react";
import Logo from "../components/Logo";
import LoginButton from "../components/LoginButton";
import Voltar from "../components/Voltar";
import MenuGlobal from "../components/MenuGlobal";

const FAQS = [
  { q: "Como faço um pedido?", a: "Escolhe um restaurante, adiciona produtos ao carrinho e finaliza o checkout com a tua morada de entrega." },
  { q: "Como acompanho o meu pedido?", a: "Vai a \"Pedidos\" no teu perfil e clica no pedido mais recente para ver o estado em tempo real." },
  { q: "Posso cancelar um pedido?", a: "Contacta-nos assim que possível. Cancelamentos só são possíveis antes de a preparação começar." },
  { q: "Quais os métodos de pagamento?", a: "Podes pagar por MB WAY ou em dinheiro no momento da entrega." },
  { q: "Como funciona a taxa de entrega?", a: "A taxa de entrega é calculada com base na distância real de condução entre o restaurante e a tua morada." },
  { q: "Posso agendar um pedido?", a: "Sim! No checkout podes escolher entrega agendada e selecionar a data e hora pretendidas." },
  { q: "Como adiciono uma morada?", a: "Vai a \"Moradas\" no teu perfil e clica em \"Adicionar morada\". Podes usar o mapa para definir a localização exata." },
  { q: "O meu restaurante favorito não aparece", a: "Verifica se a tua morada está dentro da zona de entrega do restaurante — algumas zonas têm cobertura limitada." },
];

export default function Ajuda() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <main className="min-h-screen bg-gray-50">
      <Logo />
      <div className="header-right-actions">
        <LoginButton />
      </div>
      <div id="wave-top"></div>

      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-[170px] max-[575px]:pt-[165px]">
        <h1 className="mb-6 text-2xl font-black text-gray-900">Ajuda</h1>

        <section className="mb-6">
          <h2 className="mb-3 px-1 text-sm font-bold text-gray-700">Fala connosco</h2>
          <a
            href="https://pedeja.pt/contatos.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4 transition-colors hover:bg-gray-50"
          >
            <span className="text-sm font-semibold text-gray-900">Ver todos os contactos</span>
            <ExternalLink className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
          </a>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-1.5 px-1 text-sm font-bold text-gray-700">
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
            Perguntas frequentes
          </h2>
          <div className="grid gap-2">
            {FAQS.map((faq, index) => (
              <div key={faq.q} className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <span className="text-sm font-semibold text-gray-900">{faq.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${openFaq === index ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {openFaq === index ? (
                  <p className="px-4 pb-4 text-sm leading-relaxed text-gray-500">{faq.a}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      <Voltar />
      <MenuGlobal />
    </main>
  );
}
