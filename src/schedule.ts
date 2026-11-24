import type { HolidayCalendar } from "./holidays";
import type { TimeSlotId } from "./rates";

export interface AutoSlotResult {
  slot: TimeSlotId;
  beijingDate: string;
  beijingTime: string;
  reason: string;
  holidayCoverage: "covered" | "unknown";
}

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function resolveAutoSlot(now: Date, calendar: HolidayCalendar): AutoSlotResult {
  const parts = new Map(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts.get("year"));
  const month = parts.get("month")!;
  const day = parts.get("day")!;
  const hour = Number(parts.get("hour"));
  const minute = Number(parts.get("minute"));
  const second = Number(parts.get("second"));
  const weekday = parts.get("weekday");
  const beijingDate = `${year}-${month}-${day}`;
  const beijingTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const holidayCoverage = calendar.years.has(year) ? "covered" : "unknown";
  const isHoliday = holidayCoverage === "covered" && calendar.dates.has(beijingDate);
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday!);
  const seconds = hour * 3_600 + minute * 60 + second;
  const isPeakClock =
    (seconds >= 9 * 3_600 && seconds < 12 * 3_600) ||
    (seconds >= 14 * 3_600 && seconds < 18 * 3_600);
  const isPeak = isWeekday && !isHoliday && isPeakClock;

  const reason = isHoliday
    ? "法定节假日，空闲"
    : isWeekend
      ? "周末，空闲"
      : isPeak
        ? "工作日高峰"
        : "工作日非高峰时段，空闲";

  return {
    slot: isPeak ? "peak" : "offPeak",
    beijingDate,
    beijingTime,
    reason,
    holidayCoverage,
  };
}
