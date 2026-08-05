// Construtor do horario semanal normal (blocos de dias+hora), partilhado
// entre a pagina /parceiros e o editor de dados da loja embutido no
// dashboard do admin -- extraido para nao duplicar esta logica nos dois
// sitios.

export const DAYS = [
  { id: 1, label: "Segunda", short: "Seg" },
  { id: 2, label: "Terça", short: "Ter" },
  { id: 3, label: "Quarta", short: "Qua" },
  { id: 4, label: "Quinta", short: "Qui" },
  { id: 5, label: "Sexta", short: "Sex" },
  { id: 6, label: "Sábado", short: "Sab" },
  { id: 0, label: "Domingo", short: "Dom" },
];

export const DAY_PRESETS = [
  { id: "workdays", label: "Dias úteis", days: [1, 2, 3, 4, 5] },
  { id: "weekend", label: "Fim de semana", days: [6, 0] },
  { id: "all", label: "Todos os dias", days: [1, 2, 3, 4, 5, 6, 0] },
];

export const SHIFT_PRESETS = [
  { id: "almoco", label: "Almoço 12:00-15:00", open: "12:00", close: "15:00" },
  { id: "jantar", label: "Jantar 19:00-23:00", open: "19:00", close: "23:00" },
  { id: "dia", label: "Dia inteiro 09:00-22:00", open: "09:00", close: "22:00" },
];

export function createBlock(id, days = [1, 2, 3, 4, 5], open = "09:00", close = "22:00") {
  return { id, days, open, close };
}

export function formatBlockDays(days = []) {
  const selected = DAYS.filter((day) => days.includes(day.id)).map((day) => day.short);
  return selected.length ? selected.join(", ") : "Sem dias selecionados";
}

export function scheduleToBlocks(schedule) {
  const weekly = Array.isArray(schedule?.weekly) ? schedule.weekly : [];
  if (!weekly.length) return [createBlock(1)];

  return weekly.map((entry, index) => createBlock(
    index + 1,
    Array.isArray(entry.days) ? entry.days.map((day) => Number(day)).filter((day) => day >= 0 && day <= 6) : [],
    entry.open || "09:00",
    entry.close || "22:00",
  ));
}

export function buildSchedule(blocks) {
  return {
    timezone: "Europe/Lisbon",
    weekly: blocks.map((block) => ({
      days: block.days,
      open: block.open,
      close: block.close,
    })),
  };
}
