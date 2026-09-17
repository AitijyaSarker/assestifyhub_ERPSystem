export function buildDateRangeFilter(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  const filter: { gte?: Date; lte?: Date } = {};
  if (from) {
    const fromDate = from.length <= 10 ? new Date(`${from}T00:00:00.000Z`) : new Date(from);
    if (!isNaN(fromDate.getTime())) {
      filter.gte = fromDate;
    }
  }
  if (to) {
    const toDate = to.length <= 10 ? new Date(`${to}T23:59:59.999Z`) : new Date(to);
    if (!isNaN(toDate.getTime())) {
      filter.lte = toDate;
    }
  }
  return Object.keys(filter).length > 0 ? filter : undefined;
}
