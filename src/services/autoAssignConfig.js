export const AUTO_ASSIGN_CRITERIA_OPTIONS = [
  { key: "availability", label: "Disponibilidade", hint: "Prioriza estafetas livres, sem pedidos ativos." },
  { key: "workload", label: "Menor carga", hint: "Favorece quem tem menos pedidos no dia." },
  { key: "proximity", label: "Proximidade", hint: "Favorece quem esta mais perto do centro operativo." },
];

export const DEFAULT_AUTO_ASSIGN_CRITERIA = {
  availability: true,
  workload: true,
  proximity: true,
};

export function sanitizeAutoAssignCriteria(value) {
  const source = value && typeof value === "object" ? value : {};
  const normalized = {
    availability: Boolean(source.availability),
    workload: Boolean(source.workload),
    proximity: Boolean(source.proximity),
  };

  if (!normalized.availability && !normalized.workload && !normalized.proximity) {
    return { ...DEFAULT_AUTO_ASSIGN_CRITERIA };
  }

  return normalized;
}

export function sanitizeAutoAssignConfig(value, enabledFallback = false) {
  const source = value && typeof value === "object" ? value : {};

  return {
    enabled: Object.prototype.hasOwnProperty.call(source, "enabled")
      ? Boolean(source.enabled)
      : Boolean(enabledFallback),
    criteria: sanitizeAutoAssignCriteria(source.criteria || source),
  };
}

export function criteriaSummaryText(criteria) {
  const normalized = sanitizeAutoAssignCriteria(criteria);
  const labels = AUTO_ASSIGN_CRITERIA_OPTIONS
    .filter((option) => normalized[option.key])
    .map((option) => option.label);

  return labels.length > 0 ? labels.join(" + ") : "Criterios padrao";
}

export function resolveEffectiveAutoAssignConfig(store, globalConfig) {
  const normalizedGlobal = sanitizeAutoAssignConfig(globalConfig, Boolean(globalConfig?.enabled));
  const normalizedStore = sanitizeAutoAssignConfig(
    store?.configuracao_auto_assign,
    Boolean(store?.atribuicao_automatica_estafeta),
  );

  if (normalizedGlobal.enabled) {
    return {
      enabled: true,
      criteria: normalizedGlobal.criteria,
      source: "global",
    };
  }

  if (normalizedStore.enabled || store?.atribuicao_automatica_estafeta) {
    return {
      enabled: true,
      criteria: normalizedStore.criteria,
      source: "store",
    };
  }

  return {
    enabled: false,
    criteria: normalizedStore.criteria,
    source: "disabled",
  };
}
