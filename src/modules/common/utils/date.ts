import dayjs from "dayjs"
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

const tz = "Africa/Lagos";
dayjs.tz.setDefault(tz);


export function getPrevFromAndTo(fromStr: string, toStr: string) {
  const from = dayjs(fromStr).tz(tz, true).startOf('day')
  const to = dayjs(toStr).tz(tz, true).endOf("day")

  const daysDiff = to.diff(from, 'days')
  const subtractDays = daysDiff > 0 ? daysDiff : 1

  const prevTo = from
    .subtract(1, 'day')
    .endOf('day')
    .toDate()
  const prevFrom = from.subtract(subtractDays, 'days').toDate()

  return { from: from.toDate(), to: to.toDate(), prevTo, prevFrom }
}

export function getDates(from: string | Date, to: string | Date, period: string = 'M') {
  const dates: { to: Date; from: Date }[] = []
  let start = dayjs(from).tz(tz, true).startOf('day')
  const end = dayjs(to).tz(tz, true).endOf("day");

  while (dayjs(dates[dates.length - 1]?.to || start).isBefore(end)) {
    dates.push({
      from: start.startOf(period as any).toDate(),
      to: start.endOf(period as any).toDate(),
    })
    start = start.add(1, period as any)
  }

  return dates
}