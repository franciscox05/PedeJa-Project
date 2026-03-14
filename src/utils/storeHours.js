function toMinutes(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const [hour, minute] = text.split(":").map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function normalizeSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") return null;
  const weekly = Array.isArray(schedule.weekly) ? schedule.weekly : [];
  if (weekly.length === 0) return null;
  return {
    timezone: schedule.timezone || "Europe/Lisbon",
    weekly: weekly
      .map((entry) => {
        const days = Array.isArray(entry.days) ? entry.days.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6) : [];
        const open = toMinutes(entry.open);
        const close = toMinutes(entry.close);
        if (!days.length || open === null || close === null) return null;
        return { days, open, close };
      })
      .filter(Boolean),
  };
}

export function isStoreOpenAt(schedule, date = new Date()) {
  const normalized = normalizeSchedule(schedule);
  if (!normalized) return true;

  const day = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();

  return normalized.weekly.some((entry) => {
    if (entry.open === entry.close) return false;

    if (entry.open < entry.close) {
      if (!entry.days.includes(day)) return false;
      return minutes >= entry.open && minutes < entry.close;
    }

    // Overnight window (e.g. 20:00-02:00)
    if (entry.days.includes(day) && minutes >= entry.open) return true;

    const previousDay = (day + 6) % 7;
    if (entry.days.includes(previousDay) && minutes < entry.close) return true;

    return false;
  });
}

export function isStoreOpenNow(schedule) {
  return isStoreOpenAt(schedule, new Date());
}

export function formatScheduleLabel(schedule) {
  const normalized = normalizeSchedule(schedule);
  if (!normalized) return "Horario nao definido";

  const daysMap = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const blocks = normalized.weekly.map((entry) => {
    const days = entry.days.map((d) => daysMap[d]).join(", ");
    const open = `${String(Math.floor(entry.open / 60)).padStart(2, "0")}:${String(entry.open % 60).padStart(2, "0")}`;
    const close = `${String(Math.floor(entry.close / 60)).padStart(2, "0")}:${String(entry.close % 60).padStart(2, "0")}`;
    return `${days} ${open}-${close}`;
  });

  return blocks.join(" | ");
}