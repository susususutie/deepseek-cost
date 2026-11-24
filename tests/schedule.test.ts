import { describe, expect, it } from "vite-plus/test";
import { HOLIDAY_CALENDAR } from "../src/holidays";
import { resolveAutoSlot } from "../src/schedule";

describe("resolveAutoSlot", () => {
  it.each([
    ["2026-11-24T00:59:00Z", "offPeak", "08:59", "工作日"],
    ["2026-11-24T01:00:00Z", "peak", "09:00", "工作日"],
    ["2026-11-24T03:59:59Z", "peak", "11:59", "工作日"],
    ["2026-11-24T04:00:00Z", "offPeak", "12:00", "工作日"],
    ["2026-11-24T06:00:00Z", "peak", "14:00", "工作日"],
    ["2026-11-24T10:00:00Z", "offPeak", "18:00", "工作日"],
    ["2026-11-21T01:00:00Z", "offPeak", "09:00", "周末"],
    ["2027-01-01T01:00:00Z", "offPeak", "09:00", "法定节假日"],
  ] as const)("%s 判定为 %s", (instant, slot, time, reason) => {
    const result = resolveAutoSlot(new Date(instant), HOLIDAY_CALENDAR);

    expect(result.slot).toBe(slot);
    expect(result.beijingTime).toBe(time);
    expect(result.reason).toContain(reason);
    expect(result.holidayCoverage).toBe("covered");
  });

  it("未覆盖年份不伪称节假日判断完整", () => {
    const result = resolveAutoSlot(new Date("2028-01-03T01:00:00Z"), HOLIDAY_CALENDAR);

    expect(result.beijingDate).toBe("2028-01-03");
    expect(result.slot).toBe("peak");
    expect(result.holidayCoverage).toBe("unknown");
  });
});

describe("HOLIDAY_CALENDAR", () => {
  it("包含国务院公布的 2026 与 2027 全部 62 个放假日", () => {
    expect([...HOLIDAY_CALENDAR.years].sort((left, right) => left - right)).toEqual([2026, 2027]);
    expect(HOLIDAY_CALENDAR.dates.size).toBe(62);
  });

  it.each([
    "2026-01-01",
    "2026-02-15",
    "2026-02-23",
    "2026-04-06",
    "2026-05-01",
    "2026-06-19",
    "2026-09-25",
    "2026-10-07",
    "2027-01-01",
    "2027-02-05",
    "2027-02-13",
    "2027-04-05",
    "2027-05-05",
    "2027-06-09",
    "2027-09-15",
    "2027-10-07",
  ])("覆盖放假日 %s", (date) => {
    expect(HOLIDAY_CALENDAR.dates.has(date)).toBe(true);
  });
});
