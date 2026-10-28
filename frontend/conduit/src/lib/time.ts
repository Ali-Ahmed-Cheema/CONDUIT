import { TZ } from "../crypto/config";

export const F = (options: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...options });

export const fullDateTime = (value: number) =>
  F({ dateStyle: "medium", timeStyle: "short", hour12: true }).format(value);

export const msgTime = (value: number) =>
  F({ day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }).format(value);

export const dayKey = (value: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(value);

export const hourNow = () => parseInt(F({ hour: "numeric", hour12: false }).format(new Date()), 10) % 24;

export const greeting = () => {
  const h = hourNow();
  return "Good " + (h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening") + ", Ali";
};
