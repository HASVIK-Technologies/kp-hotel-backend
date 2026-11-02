/** Business dates are Indian Standard Time (UTC+5:30). */
export const IST_OFFSET_MS = 5.5 * 3600_000;
export const DAY_MS = 86400_000;

export const istNow = () => new Date(Date.now() + IST_OFFSET_MS);
/** Today's date in IST as yyyy-mm-dd. */
export const istToday = () => istNow().toISOString().slice(0, 10);
/** Convert an ISO timestamp to its IST calendar date (yyyy-mm-dd). */
export const istDate = (iso: string) => new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
export const addDaysIso = (from: Date, days: number) => new Date(from.getTime() + days * DAY_MS).toISOString().slice(0, 10);
