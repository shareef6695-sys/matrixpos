import { describe, expect, it } from "vitest";
import { addMonths, daysLeft, fmtMinutes, hoursQty, parseDuration, renewalState, renewedEnd, timeInvoiceLines } from "@/lib/hq/projects";
import { can } from "@/lib/hq/roles";

describe("durations", () => {
  it("reads the ways people type time", () => {
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("1h30")).toBe(90);
    expect(parseDuration("1h 30m")).toBe(90);
    expect(parseDuration("90m")).toBe(90);
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("2")).toBe(120);
    expect(parseDuration("1.5")).toBe(90);
    expect(parseDuration("1,25h")).toBe(75);
  });
  it("refuses nonsense, zero and over a day", () => {
    for (const x of ["", "abc", "0", "0:00", "25h", "1:99:00"]) expect(parseDuration(x)).toBeNull();
  });
  it("formats minutes and hours", () => {
    expect(fmtMinutes(90)).toBe("1:30");
    expect(fmtMinutes(5)).toBe("0:05");
    expect(hoursQty(20)).toBe(0.333);
    expect(hoursQty(90)).toBe(1.5);
  });
});

describe("invoicing time", () => {
  const e = (id: string, minutes: number, date: string, taskId: string | null, taskTitle: string | null) => ({ id, minutes, date, description: null, taskId, taskTitle, person: "Sam" });
  const entries = [e("a", 60, "2026-11-02", "t1", "Design"), e("b", 30, "2026-11-05", "t1", "Design"), e("c", 45, "2026-11-03", null, null)];
  it("groups by task, with dates and hours", () => {
    const lines = timeInvoiceLines(entries, { project: "Booking app", rateMinor: 6000, groupBy: "task" });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ quantity: 1.5, unitMinor: 6000, ids: ["a", "b"] });
    expect(lines[0].description).toContain("Booking app: Design");
    expect(lines[0].description).toContain("2 Nov to 5 Nov");
    expect(lines[1].description).toContain("General work");
  });
  it("or one line per entry, in date order", () => {
    const lines = timeInvoiceLines(entries, { project: "P", rateMinor: 100, groupBy: "entry" });
    expect(lines.map((l) => l.ids[0])).toEqual(["a", "c", "b"]);
  });
});

describe("renewals", () => {
  it("adds months, keeping month ends sensible", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-28", 12)).toBe("2027-11-28");
  });
  it("knows when a contract needs renewing", () => {
    const c = (endDate: string | null, noticeDays = 30, status = "ACTIVE") => ({ status, endDate, noticeDays });
    expect(renewalState(c("2027-06-01"), "2026-11-28")).toBe("none");
    expect(renewalState(c("2027-02-01"), "2026-11-28")).toBe("upcoming");
    expect(renewalState(c("2026-12-20"), "2026-11-28")).toBe("due");
    expect(renewalState(c("2026-11-28"), "2026-11-28")).toBe("due");
    expect(renewalState(c("2026-11-27"), "2026-11-28")).toBe("overdue");
    expect(renewalState(c(null), "2026-11-28")).toBe("none");
    expect(renewalState(c("2026-11-27", 30, "ENDED"), "2026-11-28")).toBe("none");
    expect(daysLeft("2026-12-01", "2026-11-28")).toBe(3);
  });
  it("renews a lapsed contract by as many terms as it takes", () => {
    expect(renewedEnd("2026-11-27", 12, "2026-11-28")).toEqual({ endDate: "2027-11-27", terms: 1 });
    expect(renewedEnd("2026-08-31", 1, "2026-11-28")).toEqual({ endDate: "2026-11-30", terms: 3 });
    expect(renewedEnd("2026-11-28", 12, "2026-11-28")).toEqual({ endDate: "2026-11-28", terms: 0 });
  });
});

describe("phase 3 roles", () => {
  it("project staff log time and run projects, but can't see money", () => {
    expect(can("PROJECTS", "time.log")).toBe(true);
    expect(can("PROJECTS", "projects.edit")).toBe(true);
    expect(can("PROJECTS", "invoices.view")).toBe(false);
    expect(can("PROJECTS", "accounts.view")).toBe(false);
    expect(can("PROJECTS", "contracts.edit")).toBe(false);
  });
  it("sales handle contracts; read only changes nothing", () => {
    expect(can("SALES", "contracts.edit")).toBe(true);
    expect(can("SALES", "time.log")).toBe(false);
    expect(can("VIEWER", "projects.view")).toBe(true);
    expect(can("VIEWER", "projects.edit")).toBe(false);
    expect(can("MANAGER", "time.log")).toBe(true);
  });
});
