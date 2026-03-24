import { useEffect, useMemo, useState } from "react";
import { useCart } from "../context/CartContext";
import { useNavigate } from "react-router-dom";
import { criarPedidoCheckout } from "../services/checkoutService";
import {
  fetchUserAddresses,
  saveUserAddress,
  updateAddressCoordinates,
} from "../services/addressService";
import {
  BARCELOS_CENTER,
  computeDeliveryQuoteByDistance,
  formatDistanceKm,
  resolveEffectiveDeliveryPricingConfig,
  resolveDeliveryPricingMaxKm,
} from "../services/deliveryZoneService";
import {
  geocodeAddressWithGoogle,
  getDrivingDistanceKm,
} from "../services/googleMapsService";
import { extractUserId } from "../utils/roles";
import { groupSelectedMenuOptionsForDisplay } from "../services/menuOptionsService";
import { resolveDisplayPrice } from "../services/pricingService";
import { fetchGlobalDeliveryPricingConfig, supabase } from "../services/supabaseClient";
import LocationPickerModal from "../components/LocationPickerModal";
import DatePickerCustom from "../components/ui/DatePickerCustom";
import "../css/Carrinho.css";

function buildAddressLine({ rua, porta, codigoPostal, cidade }) {
  return `${String(rua).trim()}, ${String(porta).trim()}, ${String(codigoPostal).trim()} ${String(cidade).trim()}, Portugal`;
}

function getNowForDateTimeLocal() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 10);
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function isFiniteCoordinate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed);
}

export default function Carrinho() {
  const { cart, removeFromCart, addToCart, decreaseQuantity, clearCart } = useCart();
  const navigate = useNavigate();

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const [user, setUser] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [dadosEntrega, setDadosEntrega] = useState({ nome: "", telefone: "", morada: "", notas: "" });

  const [newAddress, setNewAddress] = useState({
    label: "Casa",
    rua: "",
    porta: "",
    codigoPostal: "",
    cidade: "",
    is_default: false,
  });
  const [newAddressGeo, setNewAddressGeo] = useState(null);

  const [storeOrigin, setStoreOrigin] = useState({
    idloja: null,
    nome: "",
    lat: null,
    lng: null,
    taxaentrega: null,
    comissao_pedeja_percent: null,
    configuracoes_comissao: null,
    configuracao_entrega: null,
  });
  const [globalDeliveryPricingConfig, setGlobalDeliveryPricingConfig] = useState(null);
  const [storeOriginLoading, setStoreOriginLoading] = useState(false);

  const [deliveryQuote, setDeliveryQuote] = useState({
    deliverable: false,
    fee: 0,
    distanceKm: null,
    tier: null,
    reason: "Escolhe uma morada para calcular a taxa de entrega.",
  });
  const [deliveryLoading, setDeliveryLoading] = useState(false);

  const [deliveryMode, setDeliveryMode] = useState("ASAP");
  const [scheduledAt, setScheduledAt] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");

  const selectedAddress = useMemo(
    () => addresses.find((item) => String(item.id) === String(selectedAddressId)) || null,
    [addresses, selectedAddressId],
  );

  const storePricingSource = storeOrigin;
  const subtotal = cart.reduce(
    (acc, item) => acc + resolveDisplayPrice(item, storePricingSource) * Number(item.qtd || 1),
    0,
  );
  const taxaEntrega = deliveryQuote.deliverable ? Number(deliveryQuote.fee || 0) : 0;
  const totalFinal = subtotal + taxaEntrega;

  const cartLojaId = useMemo(() => {
    const firstId = Number(cart?.[0]?.idloja);
    return Number.isFinite(firstId) ? firstId : null;
  }, [cart]);
  const deliveryMaxKm = useMemo(
    () => resolveDeliveryPricingMaxKm(storeOrigin.configuracao_entrega),
    [storeOrigin.configuracao_entrega],
  );

  const validarNovaMorada = () => {
    if (isFiniteCoordinate(newAddressGeo?.lat) && isFiniteCoordinate(newAddressGeo?.lng)) {
      return "";
    }

    if (!newAddress.rua.trim()) return "Preencha a Rua.";
    if (!newAddress.porta.trim()) return "Preencha a Porta.";
    if (!newAddress.codigoPostal.trim()) return "Preencha o Codigo Postal.";
    if (!newAddress.cidade.trim()) return "Preencha a Cidade.";

    const postalRegex = /^\d{4}-\d{3}$/;
    if (!postalRegex.test(newAddress.codigoPostal.trim())) {
      return "Codigo Postal invalido. Use o formato 0000-000.";
    }

    return "";
  };

  const loadStoreOrigin = async () => {
    if (!cartLojaId) {
      setStoreOrigin({
        idloja: null,
        nome: "",
        lat: null,
        lng: null,
        taxaentrega: null,
        comissao_pedeja_percent: null,
        configuracoes_comissao: null,
        configuracao_entrega: null,
      });
      setGlobalDeliveryPricingConfig(null);
      return;
    }

    setStoreOriginLoading(true);
    try {
      const [globalDeliveryPricing, initialStoreResponse] = await Promise.all([
        fetchGlobalDeliveryPricingConfig(),
        supabase
          .from("lojas")
          .select("idloja, nome, latitude, longitude, taxaentrega, comissao_pedeja_percent, configuracoes_comissao, configuracao_entrega")
          .eq("idloja", cartLojaId)
          .maybeSingle(),
      ]);
      let response = initialStoreResponse;

      if (response.error && /configuracoes_comissao|configuracao_entrega/i.test(String(response.error.message || ""))) {
        response = await supabase
          .from("lojas")
          .select("idloja, nome, latitude, longitude, taxaentrega, comissao_pedeja_percent")
          .eq("idloja", cartLojaId)
          .maybeSingle();
      }

      if (response.error) throw response.error;
      if (!response.data) throw new Error("Loja nao encontrada para calcular entrega.");
      setGlobalDeliveryPricingConfig(globalDeliveryPricing?.config || null);

      const effectiveDeliveryPricingConfig = resolveEffectiveDeliveryPricingConfig(
        response.data.configuracao_entrega || null,
        globalDeliveryPricing?.config || null,
        response.data.taxaentrega,
      );

      setStoreOrigin({
        idloja: response.data.idloja,
        nome: response.data.nome || `Loja #${cartLojaId}`,
        lat: isFiniteCoordinate(response.data.latitude) ? Number(response.data.latitude) : null,
        lng: isFiniteCoordinate(response.data.longitude) ? Number(response.data.longitude) : null,
        taxaentrega: Number.isFinite(Number(response.data.taxaentrega))
          ? Number(response.data.taxaentrega)
          : null,
        comissao_pedeja_percent: Number.isFinite(Number(response.data.comissao_pedeja_percent))
          ? Number(response.data.comissao_pedeja_percent)
          : 0,
        configuracoes_comissao: response.data.configuracoes_comissao || null,
        configuracao_entrega: effectiveDeliveryPricingConfig,
      });
    } catch (error) {
      setStoreOrigin({
        idloja: cartLojaId,
        nome: "",
        lat: null,
        lng: null,
        taxaentrega: null,
        comissao_pedeja_percent: null,
        configuracoes_comissao: null,
        configuracao_entrega: null,
      });
      setGlobalDeliveryPricingConfig(null);
      setDeliveryQuote({
        deliverable: false,
        fee: 0,
        distanceKm: null,
        tier: null,
        reason: error?.message || "Nao foi possivel carregar coordenadas da loja.",
      });
    } finally {
      setStoreOriginLoading(false);
    }
  };

  const loadAddresses = async (currentUser) => {
    const userId = extractUserId(currentUser);
    if (!userId) {
      setAddresses([]);
      setUseNewAddress(true);
      return;
    }

    try {
      const data = await fetchUserAddresses(userId);
      setAddresses(data);

      if (data.length > 0) {
        const defaultAddress = data.find((item) => item.is_default) || data[0];
        setSelectedAddressId(String(defaultAddress.id));
        setDadosEntrega((prev) => ({ ...prev, morada: defaultAddress.address_line || "" }));
        setUseNewAddress(false);
      } else {
        setUseNewAddress(true);
      }
    } catch (error) {
      console.error(error);
      setUseNewAddress(true);
    }
  };

  useEffect(() => {
    const userRaw = localStorage.getItem("pedeja_user");
    const localUser = userRaw ? JSON.parse(userRaw) : null;
    setUser(localUser);

    if (localUser) {
      setDadosEntrega((prev) => ({
        ...prev,
        nome: localUser.username || prev.nome,
        telefone: localUser.telemovel || prev.telefone,
      }));
      loadAddresses(localUser);
    } else {
      setUseNewAddress(true);
    }
  }, []);

  useEffect(() => {
    loadStoreOrigin();
  }, [cartLojaId]);

  useEffect(() => {
    if (!cartLojaId) return undefined;

    const channel = supabase
      .channel(`store-commission-cart-${cartLojaId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lojas",
          filter: `idloja=eq.${cartLojaId}`,
        },
        (payload) => {
          const nextStoreSpecificConfig = payload?.new?.configuracao_entrega || null;
          setStoreOrigin((prev) => ({
            ...prev,
            taxaentrega: Number.isFinite(Number(payload?.new?.taxaentrega))
              ? Number(payload.new.taxaentrega)
              : prev.taxaentrega,
            comissao_pedeja_percent: Number.isFinite(Number(payload?.new?.comissao_pedeja_percent))
              ? Number(payload.new.comissao_pedeja_percent)
              : 0,
            configuracoes_comissao: payload?.new?.configuracoes_comissao || null,
            configuracao_entrega: resolveEffectiveDeliveryPricingConfig(
              nextStoreSpecificConfig,
              globalDeliveryPricingConfig,
              payload?.new?.taxaentrega ?? prev.taxaentrega,
            ),
          }));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cartLojaId, globalDeliveryPricingConfig]);

  useEffect(() => {
    const channel = supabase
      .channel("global-delivery-pricing-cart")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "configuracoes_plataforma",
          filter: "chave=eq.delivery_pricing_default",
        },
        async (payload) => {
          const nextGlobalConfig = payload?.new?.valor || null;
          setGlobalDeliveryPricingConfig(nextGlobalConfig);
          if (cartLojaId) {
            await loadStoreOrigin();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cartLojaId]);

  const handleVoltar = () => {
    const ultimaRota = localStorage.getItem("ultima_rota_lojas");
    if (ultimaRota) {
      navigate(ultimaRota);
      return;
    }
    navigate("/");
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setDadosEntrega((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddressSelect = (e) => {
    const addressId = e.target.value;
    setCheckoutError("");

    if (addressId === "__new__") {
      setSelectedAddressId("");
      setUseNewAddress(true);
      setNewAddressGeo(null);
      setDadosEntrega((prev) => ({ ...prev, morada: "" }));
      return;
    }

    setUseNewAddress(false);
    setSelectedAddressId(addressId);

    const selected = addresses.find((item) => String(item.id) === String(addressId));
    if (!selected) return;

    setDadosEntrega((prev) => ({ ...prev, morada: selected.address_line || "" }));
  };

  const ensureExistingAddressCoordinates = async (address) => {
    const currentLat = Number(address?.lat);
    const currentLng = Number(address?.lng);
    if (Number.isFinite(currentLat) && Number.isFinite(currentLng)) {
      return { lat: currentLat, lng: currentLng, place_id: address?.place_id || null };
    }

    const geocoded = await geocodeAddressWithGoogle(address?.address_line);
    if (!geocoded || !isFiniteCoordinate(geocoded.lat) || !isFiniteCoordinate(geocoded.lng)) {
      return null;
    }

    if (address?.id) {
      try {
        await updateAddressCoordinates(address.id, {
          lat: geocoded.lat,
          lng: geocoded.lng,
          place_id: geocoded.place_id || null,
        });
        setAddresses((prev) => prev.map((item) => (
          String(item.id) === String(address.id)
            ? { ...item, lat: geocoded.lat, lng: geocoded.lng, place_id: geocoded.place_id || null }
            : item
        )));
      } catch (error) {
        console.error("Falha ao atualizar coordenadas da morada guardada:", error);
      }
    }

    return {
      lat: Number(geocoded.lat),
      lng: Number(geocoded.lng),
      place_id: geocoded.place_id || null,
    };
  };

  const geocodeNewAddress = async (addressLine) => {
    if (isFiniteCoordinate(newAddressGeo?.lat) && isFiniteCoordinate(newAddressGeo?.lng)) {
      if (!addressLine || !newAddressGeo?.source || newAddressGeo.source === addressLine) {
        return newAddressGeo;
      }
    }

    if (!addressLine) return null;
    const geocoded = await geocodeAddressWithGoogle(addressLine);
    if (!geocoded) return null;

    const withSource = {
      ...geocoded,
      source: geocoded.address_line || addressLine,
    };
    setNewAddressGeo(withSource);
    return withSource;
  };

  const calculateQuoteForCoordinates = async (coords) => {
    if (!isFiniteCoordinate(coords?.lat) || !isFiniteCoordinate(coords?.lng)) {
      return {
        deliverable: false,
        fee: 0,
        distanceKm: null,
        tier: null,
        reason: "Morada sem coordenadas validas.",
      };
    }

    const drivingDistanceKm = await getDrivingDistanceKm(
      BARCELOS_CENTER,
      { lat: Number(coords.lat), lng: Number(coords.lng) },
    );

    return computeDeliveryQuoteByDistance(
      drivingDistanceKm,
      storeOrigin.configuracao_entrega,
      storeOrigin.taxaentrega,
    );
  };

  useEffect(() => {
    if (useNewAddress) return;

    let cancelled = false;
    const run = async () => {
      if (!selectedAddress) {
        setDeliveryQuote({
          deliverable: false,
          fee: 0,
          distanceKm: null,
          tier: null,
          reason: "Escolhe uma morada para calcular a taxa de entrega.",
        });
        return;
      }

      setDeliveryLoading(true);
      try {
        const coords = await ensureExistingAddressCoordinates(selectedAddress);
        if (cancelled) return;
        if (!coords) {
          setDeliveryQuote({
            deliverable: false,
            fee: 0,
            distanceKm: null,
            tier: null,
            reason: "Nao foi possivel validar a morada selecionada.",
          });
          return;
        }

        const quote = await calculateQuoteForCoordinates(coords);
        if (!cancelled) setDeliveryQuote(quote);
      } catch (error) {
        if (cancelled) return;
        setDeliveryQuote({
          deliverable: false,
          fee: 0,
          distanceKm: null,
          tier: null,
          reason: error?.message || "Erro ao validar morada de entrega.",
        });
      } finally {
        if (!cancelled) setDeliveryLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [useNewAddress, selectedAddressId, selectedAddress?.address_line, selectedAddress?.lat, selectedAddress?.lng, storeOrigin.configuracao_entrega, storeOrigin.taxaentrega]);

  useEffect(() => {
    if (!useNewAddress) return;

    const validationError = validarNovaMorada();
    if (validationError) {
      setDeliveryQuote({
        deliverable: false,
        fee: 0,
        distanceKm: null,
        tier: null,
        reason: `Preenche a nova morada para calcular entrega. Limite: ${deliveryMaxKm} km.`,
      });
      return;
    }

    const composedAddress = isFiniteCoordinate(newAddressGeo?.lat) && isFiniteCoordinate(newAddressGeo?.lng)
      ? (newAddressGeo.address_line || "")
      : buildAddressLine({
        rua: newAddress.rua,
        porta: newAddress.porta,
        codigoPostal: newAddress.codigoPostal,
        cidade: newAddress.cidade,
      });

    let cancelled = false;
    const timer = setTimeout(async () => {
      setDeliveryLoading(true);
      try {
        const geocoded = await geocodeNewAddress(composedAddress);
        if (cancelled) return;

        if (!geocoded || !isFiniteCoordinate(geocoded.lat) || !isFiniteCoordinate(geocoded.lng)) {
          setDeliveryQuote({
            deliverable: false,
            fee: 0,
            distanceKm: null,
            tier: null,
            reason: `Morada fora das freguesias de Barcelos ou nao encontrada. Limite: ${deliveryMaxKm} km.`,
          });
          return;
        }

        const quote = await calculateQuoteForCoordinates(geocoded);
        if (!cancelled) setDeliveryQuote(quote);
      } catch (error) {
        if (cancelled) return;
        setDeliveryQuote({
          deliverable: false,
          fee: 0,
          distanceKm: null,
          tier: null,
          reason: error?.message || "Erro a validar nova morada.",
        });
      } finally {
        if (!cancelled) setDeliveryLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [useNewAddress, newAddress.rua, newAddress.porta, newAddress.codigoPostal, newAddress.cidade, newAddressGeo?.lat, newAddressGeo?.lng, storeOrigin.configuracao_entrega, storeOrigin.taxaentrega, deliveryMaxKm]);

  const validarCheckout = () => {
    if (!dadosEntrega.nome.trim()) return "Preencha o nome do cliente.";
    if (!dadosEntrega.telefone.trim()) return "Preencha o telefone.";

    if (useNewAddress) {
      const newAddressError = validarNovaMorada();
      if (newAddressError) return newAddressError;
    } else if (!selectedAddress && !dadosEntrega.morada.trim()) {
      return "Escolha uma morada guardada ou adicione uma nova.";
    }

    if (storeOriginLoading) {
      return "A carregar dados do restaurante...";
    }

    if (deliveryLoading) {
      return "A validar zona e taxa de entrega...";
    }

    if (!deliveryQuote.deliverable) {
      return deliveryQuote.reason || "Morada fora da zona de entrega.";
    }

    if (deliveryMode === "SCHEDULED") {
      if (!scheduledAt) return "Escolha o horario de entrega.";
      const selectedDate = new Date(scheduledAt);
      if (Number.isNaN(selectedDate.getTime()) || selectedDate.getTime() <= Date.now()) {
        return "Escolha um horario de entrega no futuro.";
      }
    }

    return "";
  };

  const handleCheckout = async () => {
    const erroValidacao = validarCheckout();
    if (erroValidacao) {
      setCheckoutError(erroValidacao);
      return;
    }

    setCheckoutError("");
    setCheckoutLoading(true);

    try {
      const userId = extractUserId(user);

      let quoteToUse = deliveryQuote;
      let addressToUse = selectedAddress;
      if (useNewAddress) {
        const composedAddress = isFiniteCoordinate(newAddressGeo?.lat) && isFiniteCoordinate(newAddressGeo?.lng)
          ? (newAddressGeo.address_line || "")
          : buildAddressLine({
            rua: newAddress.rua,
            porta: newAddress.porta,
            codigoPostal: newAddress.codigoPostal,
            cidade: newAddress.cidade,
          });

        const geocoded = await geocodeNewAddress(composedAddress);
        if (!geocoded) {
          throw new Error("Nao foi possivel validar a nova morada.");
        }

        quoteToUse = await calculateQuoteForCoordinates(geocoded);
        if (!quoteToUse.deliverable) {
          throw new Error(quoteToUse.reason || "Fora da zona de entrega.");
        }

        if (userId) {
          const saved = await saveUserAddress({
            user_id: userId,
            label: newAddress.label,
            rua: newAddress.rua,
            porta: newAddress.porta,
            codigo_postal: newAddress.codigoPostal,
            cidade: newAddress.cidade,
            address_line: geocoded.address_line || composedAddress,
            lat: geocoded.lat,
            lng: geocoded.lng,
            place_id: geocoded.place_id || null,
            is_default: newAddress.is_default || addresses.length === 0,
          });

          addressToUse = {
            ...saved,
            address_line: geocoded.address_line || composedAddress,
            label: newAddress.label,
            lat: geocoded.lat,
            lng: geocoded.lng,
            place_id: geocoded.place_id || null,
          };

          await loadAddresses(user);
        } else {
          addressToUse = {
            id: null,
            label: newAddress.label,
            address_line: geocoded.address_line || composedAddress,
            lat: geocoded.lat,
            lng: geocoded.lng,
            place_id: geocoded.place_id || null,
          };
        }
      } else if (selectedAddress) {
        const coords = await ensureExistingAddressCoordinates(selectedAddress);
        if (!coords) {
          throw new Error("Nao foi possivel validar a morada guardada.");
        }

        quoteToUse = await calculateQuoteForCoordinates(coords);
        if (!quoteToUse.deliverable) {
          throw new Error(quoteToUse.reason || "Fora da zona de entrega.");
        }

        addressToUse = {
          ...selectedAddress,
          lat: coords.lat,
          lng: coords.lng,
          place_id: coords.place_id || selectedAddress.place_id || null,
        };
      }

      const moradaFinal = addressToUse?.address_line || dadosEntrega.morada.trim();

      const resultado = await criarPedidoCheckout({
        cart,
        storePricingSource,
        deliveryFee: Number(quoteToUse.fee || 0),
        deliverySchedule: {
          mode: deliveryMode,
          scheduledAt: deliveryMode === "SCHEDULED" ? scheduledAt : null,
        },
        paymentMethod,
        customer: {
          nome: dadosEntrega.nome.trim(),
          telefone: dadosEntrega.telefone.trim(),
          morada: moradaFinal,
          notas: dadosEntrega.notas.trim(),
          user_id: userId ? String(userId) : null,
          email: user?.email || null,
          address_id: addressToUse?.id || null,
          address_label: addressToUse?.label || null,
          lat: addressToUse?.lat ?? null,
          lng: addressToUse?.lng ?? null,
          payment_method: paymentMethod,
          payment_label: paymentMethod === "CASH" ? "Dinheiro" : "MB WAY",
        },
      });

      clearCart();
      navigate(`/pedido/${resultado.order_id}`, {
        state: {
          tracking_url: resultado.tracking_url || null,
          shipday_delivery_id: resultado.shipday_delivery_id || null,
          from_checkout: true,
          allow_guest_access: !userId,
        },
      });
    } catch (error) {
      setCheckoutError(error.message || "Nao foi possivel finalizar o pedido.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="cart-page-wrapper" style={{ display: "flex", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        <h2 style={{ color: "#333", marginTop: "20px" }}>O seu carrinho esta vazio</h2>
        <button onClick={handleVoltar} className="btn-checkout-final" style={{ width: "auto", padding: "15px 40px", boxShadow: "none" }}>
          Voltar aos Restaurantes
        </button>
      </div>
    );
  }

  const checkoutDisabled = checkoutLoading || deliveryLoading || storeOriginLoading || !deliveryQuote.deliverable;

  return (
    <div className="cart-page-wrapper">
      <div className="cart-header-nav">
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer" }}>
          <span className="material-icons" style={{ fontSize: "30px", color: "#333" }}>arrow_back</span>
        </button>
        <h1 style={{ margin: 0, fontSize: "1.8rem", color: "#222" }}>O Meu Pedido</h1>
      </div>

      <div className="cart-content-grid">
        <div className="cart-items-list">
          {cart.map((item) => {
            const itemUnitPrice = resolveDisplayPrice(item, storePricingSource);
            const itemTotalPrice = itemUnitPrice * Number(item.qtd || 1);
            const cartLineId = item.cart_line_id || item.idmenu;

            return (
              <div key={cartLineId} className="cart-item-card">
              <div className="cart-item-info">
                <div className="cart-item-img-box">
                  {item.imagem ? <img src={item.imagem} alt={item.nome} /> : <span className="material-icons" style={{ fontSize: "40px", color: "#ccc" }}>restaurant</span>}
                </div>

                <div className="cart-item-details">
                  <h4>{item.nome}</h4>
                  {groupSelectedMenuOptionsForDisplay(item.opcoes_selecionadas).map((group) => (
                    <p key={`${cartLineId}-${group.groupId}`} style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.9rem" }}>
                      <strong>{group.title}:</strong> {group.options.map((option) => option.option_name).join(", ")}
                    </p>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                    <button onClick={() => decreaseQuantity(cartLineId)} style={{ width: "28px", height: "28px", borderRadius: "50%", border: "1px solid #ddd", background: "white", cursor: "pointer" }}>-</button>
                    <span style={{ fontWeight: "bold", minWidth: "20px", textAlign: "center", fontSize: "1.1rem" }}>{item.qtd}</span>
                    <button onClick={() => addToCart(item)} style={{ width: "28px", height: "28px", borderRadius: "50%", border: "none", background: "#ff3b30", color: "white", cursor: "pointer" }}>+</button>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px" }}>
                <div className="cart-item-total-price">{itemTotalPrice.toFixed(2)}EUR</div>
                <button className="btn-remove-item" onClick={() => removeFromCart(cartLineId)} title="Remover produto" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="material-icons" style={{ fontSize: "20px" }}>delete</span>
                </button>
              </div>
              </div>
            );
          })}
        </div>

        <div className="cart-summary-panel">
          <h2 style={{ marginTop: 0, marginBottom: "25px" }}>Resumo</h2>
          <div className="summary-row"><span>Subtotal</span><span>{subtotal.toFixed(2)}EUR</span></div>
          <div className="summary-row"><span>Taxa de Entrega</span><span>{taxaEntrega.toFixed(2)}EUR</span></div>
          <div className="summary-row total"><span>Total a Pagar</span><span style={{ color: "#ff3b30" }}>{totalFinal.toFixed(2)}EUR</span></div>

          <div style={{
            marginTop: "10px",
            borderRadius: "10px",
            border: "1px solid #eee",
            padding: "10px",
            background: "#fafafa",
          }}
          >
            <strong style={{ display: "block", marginBottom: "4px" }}>
              Zona de entrega{storeOrigin.nome ? ` - ${storeOrigin.nome}` : ""}
            </strong>
            {storeOriginLoading || deliveryLoading ? (
              <span style={{ color: "#0f172a" }}>A validar morada e distancia real de conducao...</span>
            ) : deliveryQuote.deliverable ? (
              <span style={{ color: "#166534" }}>
                Dentro da zona ({formatDistanceKm(deliveryQuote.distanceKm)} por estrada).
              </span>
            ) : (
              <span style={{ color: "#b91c1c" }}>{deliveryQuote.reason}</span>
            )}
          </div>

          <div style={{ marginTop: "20px", display: "grid", gap: "10px" }}>
            {addresses.length > 0 && (
              <select value={useNewAddress ? "__new__" : selectedAddressId} onChange={handleAddressSelect} style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ddd" }}>
                <option value="">Escolher morada guardada</option>
                {addresses.map((address) => (
                  <option key={address.id} value={address.id}>{address.label} - {address.address_line}</option>
                ))}
                <option value="__new__">+ Adicionar nova morada</option>
              </select>
            )}

            {addresses.length === 0 && !useNewAddress && (
              <button type="button" onClick={() => setUseNewAddress(true)} style={{ border: "1px solid #ddd", borderRadius: "10px", padding: "10px", background: "#fff" }}>
                Adicionar morada
              </button>
            )}

            {useNewAddress && (
              <div style={{ display: "grid", gap: "8px", border: "1px solid #eee", borderRadius: "12px", padding: "12px" }}>
                <strong>Nova morada de entrega</strong>
                <select value={newAddress.label} onChange={(e) => setNewAddress((prev) => ({ ...prev, label: e.target.value }))}>
                  <option value="Casa">Casa</option>
                  <option value="Trabalho">Trabalho</option>
                  <option value="Outro">Outro</option>
                </select>
                <button
                  type="button"
                  onClick={() => setShowMapPicker(true)}
                  style={{
                    border: "none",
                    borderRadius: "10px",
                    minHeight: "40px",
                    background: "#111827",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Marcar no mapa
                </button>
                <input type="text" placeholder="Rua" value={newAddress.rua} onChange={(e) => setNewAddress((prev) => ({ ...prev, rua: e.target.value }))} />
                <input type="text" placeholder="Porta" value={newAddress.porta} onChange={(e) => setNewAddress((prev) => ({ ...prev, porta: e.target.value }))} />
                <input type="text" placeholder="Codigo Postal (0000-000)" value={newAddress.codigoPostal} onChange={(e) => setNewAddress((prev) => ({ ...prev, codigoPostal: e.target.value }))} />
                <input type="text" placeholder="Cidade (Barcelos)" value={newAddress.cidade} onChange={(e) => setNewAddress((prev) => ({ ...prev, cidade: e.target.value }))} />
                {isFiniteCoordinate(newAddressGeo?.lat) && isFiniteCoordinate(newAddressGeo?.lng) ? (
                  <p style={{ margin: 0, color: "#334155", fontWeight: 600, fontSize: "0.88rem" }}>
                    Coordenadas validadas: {Number(newAddressGeo.lat).toFixed(6)}, {Number(newAddressGeo.lng).toFixed(6)}
                  </p>
                ) : null}

                {user && (
                  <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={newAddress.is_default}
                      onChange={(e) => setNewAddress((prev) => ({ ...prev, is_default: e.target.checked }))}
                    />
                    Guardar como morada principal
                  </label>
                )}
              </div>
            )}

            <input name="nome" type="text" placeholder="Nome completo" value={dadosEntrega.nome} onChange={handleFormChange} style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ddd" }} />
            <input name="telefone" type="text" placeholder="Telefone" value={dadosEntrega.telefone} onChange={handleFormChange} style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ddd" }} />
            <textarea name="notas" placeholder="Notas para o estafeta (opcional)" value={dadosEntrega.notas} onChange={handleFormChange} rows={2} style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ddd" }} />

            <div style={{ display: "grid", gap: "6px", border: "1px solid #eee", borderRadius: "12px", padding: "12px" }}>
              <strong>Horario de entrega</strong>
              <select value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value)}>
                <option value="ASAP">Imediato (ASAP)</option>
                <option value="SCHEDULED">Escolher hora especifica</option>
              </select>
              {deliveryMode === "SCHEDULED" && (
                <DatePickerCustom
                  mode="datetime"
                  placeholder="Escolher entrega"
                  min={getNowForDateTimeLocal()}
                  value={scheduledAt}
                  onChange={setScheduledAt}
                />
              )}
            </div>

            <div style={{ display: "grid", gap: "6px", border: "1px solid #eee", borderRadius: "12px", padding: "12px" }}>
              <strong>Metodo de pagamento</strong>
              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="radio"
                  name="payment_method"
                  value="CASH"
                  checked={paymentMethod === "CASH"}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                Dinheiro
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="radio"
                  name="payment_method"
                  value="MBWAY"
                  checked={paymentMethod === "MBWAY"}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                MB WAY
              </label>
            </div>
          </div>

          {checkoutError && <p style={{ color: "#c62828", marginTop: "12px", marginBottom: 0, fontWeight: 600 }}>{checkoutError}</p>}
          <button className="btn-checkout-final" onClick={handleCheckout} disabled={checkoutDisabled}>{checkoutLoading ? "A processar pedido..." : "Finalizar Pedido"}</button>
        </div>
      </div>

      <LocationPickerModal
        isOpen={showMapPicker}
        title="Selecionar localizacao de entrega"
        subtitle="Marca o ponto exato no mapa para guardar morada e coordenadas sem erro."
        initialLat={newAddressGeo?.lat ?? null}
        initialLng={newAddressGeo?.lng ?? null}
        deliveryPricingConfig={storeOrigin.configuracao_entrega}
        deliveryFeeFallback={storeOrigin.taxaentrega}
        onCancel={() => setShowMapPicker(false)}
        onConfirm={async (location) => {
          setShowMapPicker(false);
          setCheckoutError("");
          setNewAddress((prev) => ({
            ...prev,
            rua: location.rua || prev.rua,
            porta: location.porta || prev.porta || "s/n",
            codigoPostal: location.codigo_postal || prev.codigoPostal,
            cidade: location.cidade || prev.cidade || "Barcelos",
          }));
          setNewAddressGeo({
            address_line: location.address_line || null,
            lat: Number(location.lat),
            lng: Number(location.lng),
            place_id: location.place_id || null,
            source: location.address_line || null,
          });
        }}
      />
    </div>
  );
}
