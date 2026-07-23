import { supabase } from "./supabaseClient";
import { resolveCommissionPercentForItem } from "./pricingService";
import { resolveOrderEstadoInterno } from "./orderStatusMapper";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function daysToIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - Number(days || 7));
  return date.toISOString();
}

function resolveMenuCategory(menu) {
  const relation = Array.isArray(menu?.tiposmenu) ? menu.tiposmenu[0] : menu?.tiposmenu;
  return String(menu?.categoria_menu || relation?.tipomenu || "Geral").trim() || "Geral";
}

function resolveStoreTypeLabel(store, storeTypesMap) {
  const typeId = String(store?.idtipoloja || "");
  if (storeTypesMap.has(typeId)) return storeTypesMap.get(typeId);

  const relation = Array.isArray(store?.tiposloja) ? store.tiposloja[0] : store?.tiposloja;
  return relation?.descricao || relation?.tipoloja || "Sem tipo";
}

function isRestaurantType(label) {
  return /restaur/i.test(String(label || ""));
}

function createEmptyRevenueData(periodDays) {
  return {
    periodDays,
    overview: {
      totalGrossRevenue: 0,
      totalBaseValue: 0,
      totalCommissionProfit: 0,
      totalDeliveryFees: 0,
      restaurantGrossRevenue: 0,
      otherGrossRevenue: 0,
    },
    commissionCoverage: {
      exactItems: 0,
      estimatedItems: 0,
      unresolvedItems: 0,
    },
    collectiveByType: [],
    byStore: [],
    byDriver: [],
  };
}

function createAccumulator(label) {
  return {
    label,
    orders: 0,
    grossRevenue: 0,
    baseValue: 0,
    commissionProfit: 0,
    deliveryFees: 0,
  };
}

function inferOrderItemFinancials(orderItem, menuRecord, storeRecord) {
  const quantity = Math.max(1, toNumber(orderItem?.quantidade, 1));
  const finalUnit = toNumber(orderItem?.preco_unitario, 0);
  let baseUnit = null;
  let source = "unresolved";

  // Pedidos feitos depois da migracao da comissao guardam o preco base real
  // (opcoes pagas incluidas) no momento da compra -- usar isto diretamente
  // em vez de tentar adivinhar evita tanto a deriva retroativa (a comissao
  // de pedidos antigos mudar sozinha quando a config atual muda) como o erro
  // de contar opcoes pagas como se fossem comissao.
  if (Number.isFinite(Number(orderItem?.preco_base_unitario))) {
    baseUnit = toNumber(orderItem.preco_base_unitario, finalUnit);
    source = "stored";
  } else if (menuRecord && Number.isFinite(Number(menuRecord.preco))) {
    baseUnit = toNumber(menuRecord.preco, 0);
    source = "catalog";
  } else {
    const appliedPercent = resolveCommissionPercentForItem(
      {
        idmenu: orderItem?.menu_id,
        menu_id: orderItem?.menu_id,
        categoria_menu: menuRecord?.categoria_menu || "Geral",
      },
      storeRecord,
    );

    const divisor = 1 + (Number(appliedPercent || 0) / 100);
    if (divisor > 0) {
      baseUnit = Number((finalUnit / divisor).toFixed(2));
      source = appliedPercent > 0 ? "config" : "no_markup";
    }
  }

  if (!Number.isFinite(baseUnit)) {
    baseUnit = finalUnit;
    source = "fallback";
  }

  const commissionUnit = Math.max(finalUnit - baseUnit, 0);

  return {
    baseSubtotal: Number((baseUnit * quantity).toFixed(2)),
    commissionSubtotal: Number((commissionUnit * quantity).toFixed(2)),
    source,
  };
}

function buildDriverIdentity(order) {
  const name = String(order?.driver_name || "").trim();
  const phone = String(order?.driver_phone || "").trim();

  const key = name || phone || "Sem estafeta";
  return {
    key,
    name: name || "Sem estafeta",
    phone: phone || "",
  };
}

export async function fetchAdminRevenueBreakdown(periodDays = 7, callerUserId = null) {
  const since = daysToIso(periodDays);
  const until = new Date().toISOString();
  const normalizedCallerUserId = Number(callerUserId);
  if (!Number.isFinite(normalizedCallerUserId)) {
    throw new Error("Sessao invalida: inicia sessao novamente.");
  }

  const ordersRes = await supabase.rpc("list_orders_for_viewer", {
    caller_user_id: normalizedCallerUserId,
    loja_id_filter: null,
    since_input: since,
    until_input: until,
    limit_count: 1200,
  });

  if (ordersRes.error) throw ordersRes.error;

  const allOrders = ordersRes.data || [];
  const orders = allOrders.filter((order) => resolveOrderEstadoInterno(order) !== "cancelado");
  if (!orders.length) {
    return createEmptyRevenueData(periodDays);
  }

  const orderIds = orders.map((order) => order.id);
  const storeIds = [...new Set(orders.map((order) => order.loja_id).filter(Boolean))];

  const [orderItemsRes, storesRes, storeTypesRes] = await Promise.all([
    supabase.rpc("list_order_items_for_orders", { caller_user_id: normalizedCallerUserId, order_ids: orderIds }),
    supabase
      .from("lojas")
      .select(`
        idloja,
        nome,
        idtipoloja,
        comissao_pedeja_percent,
        configuracoes_comissao,
        tiposloja (descricao, tipoloja)
      `)
      .in("idloja", storeIds),
    supabase
      .from("tiposloja")
      .select("idtipoloja, descricao, tipoloja"),
  ]);

  if (orderItemsRes.error) throw orderItemsRes.error;
  if (storesRes.error) throw storesRes.error;
  if (storeTypesRes.error) throw storeTypesRes.error;

  const menuIds = [...new Set((orderItemsRes.data || []).map((item) => item.menu_id).filter(Boolean))];

  const menusRes = menuIds.length
    ? await supabase
      .from("menus")
      .select(`
        idmenu,
        idloja,
        nome,
        preco,
        idtipomenu,
        tiposmenu (tipomenu)
      `)
      .in("idmenu", menuIds)
    : { data: [], error: null };

  if (menusRes.error) throw menusRes.error;

  const storeTypesMap = new Map(
    (storeTypesRes.data || []).map((item) => [
      String(item.idtipoloja),
      item.descricao || item.tipoloja || `Tipo ${item.idtipoloja}`,
    ]),
  );
  const storeById = new Map((storesRes.data || []).map((store) => [String(store.idloja), store]));
  const itemsByOrderId = new Map();
  const menuById = new Map(
    (menusRes.data || []).map((menu) => [
      String(menu.idmenu),
      {
        ...menu,
        categoria_menu: resolveMenuCategory(menu),
      },
    ]),
  );

  (orderItemsRes.data || []).forEach((item) => {
    const key = String(item.order_id || "");
    if (!key) return;
    if (!itemsByOrderId.has(key)) itemsByOrderId.set(key, []);
    itemsByOrderId.get(key).push(item);
  });

  const overview = createEmptyRevenueData(periodDays).overview;
  const commissionCoverage = createEmptyRevenueData(periodDays).commissionCoverage;
  const collectiveByTypeMap = new Map();
  const byStoreMap = new Map();
  const byDriverMap = new Map();

  orders.forEach((order) => {
    const store = storeById.get(String(order.loja_id || "")) || null;
    const storeLabel = store?.nome || `Loja ${order.loja_id}`;
    const storeTypeLabel = resolveStoreTypeLabel(store, storeTypesMap);
    const orderItems = itemsByOrderId.get(String(order.id || "")) || [];

    let orderBaseValue = 0;
    let orderCommissionProfit = 0;

    orderItems.forEach((orderItem) => {
      const menuRecord = menuById.get(String(orderItem.menu_id || ""));
      const itemFinancials = inferOrderItemFinancials(orderItem, menuRecord, store);

      orderBaseValue += itemFinancials.baseSubtotal;
      orderCommissionProfit += itemFinancials.commissionSubtotal;

      if (itemFinancials.source === "stored" || itemFinancials.source === "catalog") {
        commissionCoverage.exactItems += 1;
      } else if (itemFinancials.source === "config" || itemFinancials.source === "no_markup") {
        commissionCoverage.estimatedItems += 1;
      } else {
        commissionCoverage.unresolvedItems += 1;
      }
    });

    const orderGrossRevenue = toNumber(order.total, 0);
    const orderDeliveryFees = toNumber(order.taxa_entrega, 0);

    overview.totalGrossRevenue += orderGrossRevenue;
    overview.totalBaseValue += orderBaseValue;
    overview.totalCommissionProfit += orderCommissionProfit;
    overview.totalDeliveryFees += orderDeliveryFees;

    if (isRestaurantType(storeTypeLabel)) {
      overview.restaurantGrossRevenue += orderGrossRevenue;
    } else {
      overview.otherGrossRevenue += orderGrossRevenue;
    }

    if (!collectiveByTypeMap.has(storeTypeLabel)) {
      collectiveByTypeMap.set(storeTypeLabel, createAccumulator(storeTypeLabel));
    }

    if (!byStoreMap.has(String(order.loja_id))) {
      byStoreMap.set(String(order.loja_id), {
        ...createAccumulator(storeLabel),
        lojaId: order.loja_id,
        storeTypeLabel,
      });
    }

    const collective = collectiveByTypeMap.get(storeTypeLabel);
    collective.orders += 1;
    collective.grossRevenue += orderGrossRevenue;
    collective.baseValue += orderBaseValue;
    collective.commissionProfit += orderCommissionProfit;
    collective.deliveryFees += orderDeliveryFees;

    const storeEntry = byStoreMap.get(String(order.loja_id));
    storeEntry.orders += 1;
    storeEntry.grossRevenue += orderGrossRevenue;
    storeEntry.baseValue += orderBaseValue;
    storeEntry.commissionProfit += orderCommissionProfit;
    storeEntry.deliveryFees += orderDeliveryFees;

    const driver = buildDriverIdentity(order);
    if (!byDriverMap.has(driver.key)) {
      byDriverMap.set(driver.key, {
        key: driver.key,
        name: driver.name,
        phone: driver.phone,
        deliveries: 0,
        ordersValue: 0,
        deliveryFees: 0,
      });
    }

    const driverEntry = byDriverMap.get(driver.key);
    driverEntry.deliveries += 1;
    driverEntry.ordersValue += orderGrossRevenue;
    driverEntry.deliveryFees += orderDeliveryFees;
  });

  const collectiveByType = Array.from(collectiveByTypeMap.values())
    .map((entry) => ({
      ...entry,
      grossRevenue: Number(entry.grossRevenue.toFixed(2)),
      baseValue: Number(entry.baseValue.toFixed(2)),
      commissionProfit: Number(entry.commissionProfit.toFixed(2)),
      deliveryFees: Number(entry.deliveryFees.toFixed(2)),
      avgOrderValue: entry.orders ? Number((entry.grossRevenue / entry.orders).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.grossRevenue - a.grossRevenue);

  const byStore = Array.from(byStoreMap.values())
    .map((entry) => ({
      ...entry,
      grossRevenue: Number(entry.grossRevenue.toFixed(2)),
      baseValue: Number(entry.baseValue.toFixed(2)),
      commissionProfit: Number(entry.commissionProfit.toFixed(2)),
      deliveryFees: Number(entry.deliveryFees.toFixed(2)),
      avgOrderValue: entry.orders ? Number((entry.grossRevenue / entry.orders).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.grossRevenue - a.grossRevenue);

  const byDriver = Array.from(byDriverMap.values())
    .map((entry) => ({
      ...entry,
      ordersValue: Number(entry.ordersValue.toFixed(2)),
      deliveryFees: Number(entry.deliveryFees.toFixed(2)),
    }))
    .sort((a, b) => b.ordersValue - a.ordersValue);

  return {
    periodDays,
    overview: {
      ...overview,
      totalGrossRevenue: Number(overview.totalGrossRevenue.toFixed(2)),
      totalBaseValue: Number(overview.totalBaseValue.toFixed(2)),
      totalCommissionProfit: Number(overview.totalCommissionProfit.toFixed(2)),
      totalDeliveryFees: Number(overview.totalDeliveryFees.toFixed(2)),
      restaurantGrossRevenue: Number(overview.restaurantGrossRevenue.toFixed(2)),
      otherGrossRevenue: Number(overview.otherGrossRevenue.toFixed(2)),
    },
    commissionCoverage,
    collectiveByType,
    byStore,
    byDriver,
  };
}
