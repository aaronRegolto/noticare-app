const SOURCES = ['manual', 'realtime'];
const LEVELS = ['safe', 'suspicious', 'dangerous'];

export function buildOverview(sourceCounts) {
  const sources = Object.fromEntries(
    SOURCES.map((source) => {
      const counts = sourceCounts[source];
      const stats = {
        safe: counts.safe,
        suspicious: counts.suspicious,
        dangerous: counts.dangerous,
        blocked: counts.blocked,
      };
      stats.scans = LEVELS.reduce((total, level) => total + stats[level], 0);
      return [source, stats];
    }),
  );

  const totals = Object.fromEntries(
    [...LEVELS, 'blocked', 'scans'].map((key) => [
      key,
      SOURCES.reduce((total, source) => total + sources[source][key], 0),
    ]),
  );

  return { ...totals, ...sources };
}
