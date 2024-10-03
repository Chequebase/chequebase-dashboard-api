import { TransactionOptions } from 'mongodb'
import numeral from 'numeral'
import { InternalServerError } from "routing-controllers";
import Logger from './logger';
import dayjs from 'dayjs';

const logger = new Logger('utils');

export function getEnvOrThrow(key: string) {
  const value = process.env[key];
  if (typeof value === 'undefined') {
    logger.error('missing env', { key })
    throw new InternalServerError('Something went wrong on our end')
  }

  return value;
}

export function escapeRegExp(str = '') {
  return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1')
}

export function getPercentageDiff(previousValue = 0, currentValue = 0) {
  if (currentValue === previousValue) {
    return { value: currentValue, percentageDiff: 0 };
  }

  const diff = numeral(currentValue).subtract(previousValue).value()!;
  const percentageDiff = numeral(diff).divide(previousValue).multiply(100).value()!;

  return { value: currentValue, percentageDiff: Number(percentageDiff.toFixed(2)) };
}

export function formatMoney(amount: number) {
  return numeral(amount).divide(100).value()!.toLocaleString()
}

export const transactionOpts: TransactionOptions = {
  readPreference: 'primary',
  readConcern: 'local',
  writeConcern: { w: 'majority' }
}

export function toTitleCase(s: string) {
  return s.replace(/^[-_]*(.)/, (_, c) => c.toUpperCase())
    .replace(/[-_]+(.)/g, (_, c) => ' ' + c.toUpperCase())
}

const isBusinessDay = (date: dayjs.Dayjs): boolean => {
  const day = date.day();
  return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
};

export function getLastBusinessDay (year: number, month: number) {
  let lastDay = dayjs(new Date(year, month + 1, 0)).tz('Africa/Lagos'); // Last day of the month
  while (!isBusinessDay(lastDay)) {
    lastDay = lastDay.subtract(1, "day");
  }

  return lastDay;
};