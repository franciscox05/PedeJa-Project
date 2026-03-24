function toMinutes(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const [hour, minute] = text.split(":").map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return hour * 60 + minute;
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function toDateKey(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function normalizeExceptionType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["custom", "custom_hours", "horario_especial", "special_hours"].includes(text)) {
    return "custom_hours";
  }
  return "closed";
}

function normalizeSpecialExceptions(schedule) {
  const candidates = Array.isArray(schedule?.exceptions)
    ? schedule.exceptions
    : Array.isArray(schedule?.special_exceptions)
      ? schedule.special_exceptions
      : Array.isArray(schedule?.special_closures)
        ? schedule.special_closures
        : [];

  return candidates
    .map((entry, index) => {
      const startDate = String(entry?.startDate || entry?.start_date || entry?.date || "").trim();
      const endDate = String(entry?.endDate || entry?.end_date || entry?.date || startDate).trim() || startDate;
      const type = normalizeExceptionType(entry?.type || entry?.mode);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return null;
      }

      const open = toMinutes(entry?.open);
      const close = toMinutes(entry?.close);

      if (type === "custom_hours" && (open === null || close === null || open === close)) {
        return null;
      }

      return {
        id: String(entry?.id || `exception-${index + 1}`),
        type,
        label: String(entry?.label || entry?.reason || entry?.title || "").trim(),
        startDate,
        endDate,
        open,
        close,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
}

function isDateWithinRange(dateKey, startDate, endDate) {
  return dateKey >= startDate && dateKey <= endDate;
}

function isWithinWindow(day, minutes, entry) {
  if (entry.open === entry.close) return false;

  if (entry.open < entry.close) {
    if (!entry.days.includes(day)) return false;
    return minutes >= entry.open && minutes < entry.close;
  }

  if (entry.days.includes(day) && minutes >= entry.open) return true;

  const previousDay = (day + 6) % 7;
  if (entry.days.includes(previousDay) && minutes < entry.close) return true;

  return false;
}

function formatMinutesLabel(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${padNumber(hours)}:${padNumber(minutes)}`;
}

export function normalizeSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") return null;

  const weekly = Array.isArray(schedule.weekly) ? schedule.weekly : [];
  const normalizedWeekly = weekly
    .map((entry) => {
      const days = Array.isArray(entry.days)
        ? entry.days.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6)
        : [];
      const open = toMinutes(entry.open);
      const close = toMinutes(entry.close);
      if (!days.length || open === null || close === null) return null;
      return { days, open, close };
    })
    .filter(Boolean);

  const normalizedExceptions = normalizeSpecialExceptions(schedule);
  if (normalizedWeekly.length === 0 && normalizedExceptions.length === 0) return null;

  return {
    timezone: schedule.timezone || "Europe/Lisbon",
    weekly: normalizedWeekly,
    exceptions: normalizedExceptions,
  };
}

export function getActiveScheduleException(schedule, date = new Date()) {
  const normalized = normalizeSchedule(schedule);
  if (!normalized) return null;

  const dateKey = toDateKey(date);
  return normalized.exceptions.find((entry) => isDateWithinRange(dateKey, entry.startDate, entry.endDate)) || null;
}

export function getStoreScheduleStatus(schedule, date = new Date()) {
  const normalized = normalizeSchedule(schedule);
  if (!normalized) {
    return {
      isOpen: true,
      source: "no_schedule",
      message: "Horario nao definido",
      exception: null,
    };
  }

  const activeException = getActiveScheduleException(normalized, date);
  const day = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();

  if (activeException) {
    if (activeException.type === "closed") {
      return {
        isOpen: false,
        source: "special_exception",
        message: activeException.label || "Encerrado excecionalmente",
        exception: activeException,
      };
    }

    const isOpen = isWithinWindow(day, minutes, {
      days: [day],
      open: activeException.open,
      close: activeException.close,
    });

    return {
      isOpen,
      source: "special_exception",
      message: activeException.label
        || `Horario especial ${formatMinutesLabel(activeException.open)}-${formatMinutesLabel(activeException.close)}`,
      exception: activeException,
    };
  }

  if (normalized.weekly.length === 0) {
    return {
      isOpen: true,
      source: "weekly",
      message: "Horario nao definido",
      exception: null,
    };
  }

  const open = normalized.weekly.some((entry) => isWithinWindow(day, minutes, entry));
  return {
    isOpen: open,
    source: "weekly",
    message: open ? "Aberto" : "Fechado",
    exception: null,
  };
}

export function isStoreOpenAt(schedule, date = new Date()) {
  return getStoreScheduleStatus(schedule, date).isOpen;
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
    const open = formatMinutesLabel(entry.open);
    const close = formatMinutesLabel(entry.close);
    return `${days} ${open}-${close}`;
  });

  return blocks.join(" | ");
}

export function formatScheduleExceptionLabel(exception) {
  if (!exception) return "";

  const rangeLabel = exception.startDate === exception.endDate
    ? exception.startDate
    : `${exception.startDate} ate ${exception.endDate}`;

  if (exception.type === "custom_hours") {
    return `${exception.label || "Horario especial"} (${rangeLabel} - ${formatMinutesLabel(exception.open)}-${formatMinutesLabel(exception.close)})`;
  }

  return `${exception.label || "Encerrado excecionalmente"} (${rangeLabel})`;
}

export function sanitizeScheduleWithExceptions(schedule) {
  const normalized = normalizeSchedule(schedule);
  if (!normalized) return null;

  return {
    timezone: normalized.timezone,
    weekly: normalized.weekly.map((entry) => ({
      days: entry.days,
      open: formatMinutesLabel(entry.open),
      close: formatMinutesLabel(entry.close),
    })),
    exceptions: normalized.exceptions.map((entry) => ({
      id: entry.id,
      type: entry.type,
      label: entry.label,
      startDate: entry.startDate,
      endDate: entry.endDate,
      open: entry.open === null ? null : formatMinutesLabel(entry.open),
      close: entry.close === null ? null : formatMinutesLabel(entry.close),
    })),
  };
}
