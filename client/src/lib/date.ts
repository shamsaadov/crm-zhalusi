/**
 * Parse a timestamp from the server as Moscow time (UTC+3).
 *
 * The database stores `timestamp without time zone` in MSK,
 * but browsers treat bare ISO strings as UTC. This helper
 * appends the +03:00 offset so `new Date()` interprets it correctly.
 */
export function parseMoscow(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  // Already contains timezone info — use as-is
  if (/[+-]\d{2}:\d{2}$/.test(dateStr) || dateStr.endsWith("Z")) {
    return new Date(dateStr);
  }
  // Replace space with T for ISO format, append Moscow offset
  const iso = dateStr.replace(" ", "T");
  return new Date(iso + "+03:00");
}
