import { afterEach, describe, expect, it, vi } from "vitest";

const persisted = vi.hoisted(() => {
  type Record = { failures: number; until: number };
  return {
    record: null as Record | null,
    readLockoutRecord: vi.fn<() => Promise<Record | null>>(),
    writeLockoutRecord: vi.fn<(value: Record) => Promise<void>>(),
  };
});

vi.mock("./vault", () => ({
  readLockoutRecord: persisted.readLockoutRecord,
  writeLockoutRecord: persisted.writeLockoutRecord,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  persisted.record = null;
});

describe("persisted lockout guardrail", () => {
  it("migrates the old localStorage lockout into IndexedDB and removes the old record", async () => {
    const values = new Map([["conduit-lockout", JSON.stringify({ failures: 2, until: 0 })]]);
    const localStorage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      removeItem: vi.fn((key: string) => values.delete(key)),
    };
    vi.stubGlobal("window", { localStorage });
    persisted.record = null;
    persisted.readLockoutRecord.mockImplementation(async () => persisted.record);
    persisted.writeLockoutRecord.mockImplementation(async (value) => {
      persisted.record = value;
    });

    const lockout = await import("./lockout");
    await lockout.initializeLockoutState();

    expect(persisted.record).toEqual({ failures: 2, until: 0 });
    expect(localStorage.removeItem).toHaveBeenCalledWith("conduit-lockout");
    expect(lockout.getLockoutState()).toEqual({ failures: 2, until: 0 });
  });

  it("persists the existing exponential delay sequence", async () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: vi.fn(() => null), removeItem: vi.fn() },
    });
    persisted.record = null;
    persisted.readLockoutRecord.mockImplementation(async () => persisted.record);
    persisted.writeLockoutRecord.mockImplementation(async (value) => {
      persisted.record = value;
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T00:00:00.000Z"));

    const lockout = await import("./lockout");
    await lockout.initializeLockoutState();
    await lockout.bumpLockout();
    await lockout.bumpLockout();
    const until = await lockout.bumpLockout();

    expect(until - Date.now()).toBe(5_000);
    expect(persisted.record).toEqual({ failures: 3, until });
  });
});
