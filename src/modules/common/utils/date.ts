import dayjs from "dayjs"

export function getPrevFromAndTo(fromStr: string, toStr: string) {
  const from = dayjs(fromStr, { utc: true }).startOf('day').toDate()
  const to = dayjs(toStr, { utc: true }).endOf('day').toDate()

  const daysDiff = dayjs(toStr, { utc: true }).diff(fromStr, 'days')
  const subtractDays = daysDiff > 0 ? daysDiff : 1

  const prevTo = dayjs(fromStr, { utc: true })
    .subtract(1, 'day')
    .endOf('day')
    .toDate()
  const prevFrom = dayjs(from).subtract(subtractDays, 'days').toDate()

  return { from, to, prevTo, prevFrom }
}

export function getDates(from: string | Date, to: string | Date, period: string = 'M') {
  const dates: { to: Date; from: Date }[] = []
  let start = dayjs(from, { utc: true }).startOf('day')
  const end = dayjs(to, { utc: true }).endOf('day')

  while (dayjs(dates[dates.length - 1]?.to || start).isBefore(end)) {
    dates.push({
      from: start.startOf(period as any).toDate(),
      to: start.endOf(period as any).toDate(),
    })
    start = start.add(1, period as any)
  }

  return dates
}