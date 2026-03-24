import { forwardRef, useMemo } from "react";
import DatePicker from "react-datepicker";
import {
  endOfDay,
  isSameDay,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";
import "react-datepicker/dist/react-datepicker.css";
import "../../css/components/DatePickerCustom.css";

function toDateValue(value, mode = "datetime") {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const numericDate = new Date(value);
    return Number.isNaN(numericDate.getTime()) ? null : numericDate;
  }

  const text = String(value).trim();
  if (!text) return null;

  if (mode === "date") {
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoValue(date, mode = "datetime") {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  if (mode === "date") {
    return `${yyyy}-${mm}-${dd}`;
  }

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function clampDate(date, minDate, maxDate) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

  if (minDate instanceof Date && !Number.isNaN(minDate.getTime()) && date.getTime() < minDate.getTime()) {
    return minDate;
  }

  if (maxDate instanceof Date && !Number.isNaN(maxDate.getTime()) && date.getTime() > maxDate.getTime()) {
    return maxDate;
  }

  return date;
}

function buildDayBoundaryTime(baseDate, fallback) {
  if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) return fallback;
  return setMinutes(setHours(new Date(), baseDate.getHours()), baseDate.getMinutes());
}

function resolveMinTime(selectedDate, minDate) {
  if (!(selectedDate instanceof Date) || !(minDate instanceof Date)) return undefined;
  if (!isSameDay(selectedDate, minDate)) return startOfDay(new Date());
  return buildDayBoundaryTime(minDate, startOfDay(new Date()));
}

function resolveMaxTime(selectedDate, maxDate) {
  if (!(selectedDate instanceof Date) || !(maxDate instanceof Date)) return undefined;
  if (!isSameDay(selectedDate, maxDate)) return endOfDay(new Date());
  return buildDayBoundaryTime(maxDate, endOfDay(new Date()));
}

const DatePickerTrigger = forwardRef(function DatePickerTrigger(
  {
    value,
    onClick,
    placeholder,
    disabled,
    id,
  },
  ref,
) {
  return (
    <button
      type="button"
      id={id}
      ref={ref}
      className={`date-picker-custom__trigger${disabled ? " is-disabled" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={`date-picker-custom__value${value ? "" : " is-placeholder"}`}>
        {value || placeholder}
      </span>
      <span className="date-picker-custom__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1Zm12 8H5v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8ZM6 6a1 1 0 0 0-1 1v1h14V7a1 1 0 0 0-1-1H6Z" />
        </svg>
      </span>
    </button>
  );
});

export default function DatePickerCustom({
  id,
  value,
  onChange,
  mode = "datetime",
  placeholder = "Selecionar data",
  disabled = false,
  min = null,
  max = null,
  className = "",
  timeIntervals = 15,
}) {
  const selectedDate = useMemo(() => toDateValue(value, mode), [mode, value]);
  const minDate = useMemo(() => toDateValue(min, mode), [min, mode]);
  const maxDate = useMemo(() => toDateValue(max, mode), [max, mode]);
  const showTimeSelect = mode === "datetime";
  const hasMinTimeConstraint = showTimeSelect && minDate instanceof Date && !Number.isNaN(minDate.getTime());
  const timeProps = useMemo(() => {
    if (!hasMinTimeConstraint) {
      return {};
    }

    const referenceDate = selectedDate || minDate || maxDate || new Date();
    const endOfReferenceDay = endOfDay(referenceDate);

    return {
      minTime: resolveMinTime(selectedDate || minDate, minDate) || startOfDay(referenceDate),
      maxTime: resolveMaxTime(selectedDate || maxDate, maxDate) || endOfReferenceDay,
    };
  }, [hasMinTimeConstraint, maxDate, minDate, selectedDate]);

  return (
    <DatePicker
      id={id}
      selected={selectedDate}
      onChange={(nextDate) => {
        const normalizedDate = clampDate(nextDate, minDate, maxDate);
        onChange?.(toIsoValue(normalizedDate, mode));
      }}
      disabled={disabled}
      showTimeSelect={showTimeSelect}
      timeIntervals={timeIntervals}
      timeCaption="Hora"
      dateFormat={showTimeSelect ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy"}
      placeholderText={placeholder}
      minDate={minDate || undefined}
      maxDate={maxDate || undefined}
      {...timeProps}
      calendarStartDay={1}
      popperPlacement="bottom-start"
      wrapperClassName={`date-picker-custom${className ? ` ${className}` : ""}`}
      calendarClassName="date-picker-custom__calendar"
      popperClassName="date-picker-custom__popper"
      customInput={(
        <DatePickerTrigger
          id={id}
          placeholder={placeholder}
        />
      )}
      showMonthDropdown
      showYearDropdown
      dropdownMode="select"
    />
  );
}
