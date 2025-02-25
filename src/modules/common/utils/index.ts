import { TransactionOptions } from 'mongodb'
import numeral from 'numeral'
import { BadRequestError, InternalServerError } from "routing-controllers";
import Logger from './logger';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Organization from '@/models/organization.model';
import { ISubscriptionPlan } from '@/models/subscription-plan.model';

dayjs.extend(utc)
dayjs.extend(timezone)

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
  if (
    currentValue === previousValue ||
    Number.isNaN(currentValue) ||
    Number.isNaN(previousValue)
  ) {
    return { value: currentValue, percentageDiff: 0 };
  }

  const diff = numeral(currentValue).subtract(previousValue).value()!;
  const percentageDiff = numeral(diff).divide(previousValue).multiply(100).value()!;

  return { value: currentValue, percentageDiff: Number(percentageDiff.toFixed(2)) };
}

export function formatMoney(amount: number, currency?: string) {
  let value = numeral(amount).divide(100).format('0,0.00')
  if (currency) value = `${currency} ${value}`;
  return value;
}

export const transactionOpts: TransactionOptions = {
  readPreference: 'primary',
  readConcern: 'local',
  writeConcern: { w: 'majority' }
}

export function toTitleCase(s = '') {
  return s.replace(/^[-_]*(.)/, (_, c) => c.toUpperCase())
    .replace(/[-_]+(.)/g, (_, c) => ' ' + c.toUpperCase())
}

const isBusinessDay = (date: dayjs.Dayjs): boolean => {
  const day = date.day();
  return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
};

export function getLastBusinessDay(year: number, month: number) {
  let lastDay = dayjs(new Date(year, month + 1, 0)).tz("Africa/Lagos", true); // Last day of the month
  while (!isBusinessDay(lastDay)) {
    lastDay = lastDay.subtract(1, "day");
  }

  return lastDay;
};

export function findDuplicates<T>(arr: T[], key: keyof T): T[] {
  const countMap = new Map<any, number>();

  arr.forEach((item) => {
    const value = item[key];
    countMap.set(value, (countMap.get(value) || 0) + 1);
  });

  return [...new Set(arr.filter((item) => countMap.get(item[key])! > 1))];
}

export function maskString(
  str: string,
  start?: number,
  length?: number,
  maskChar: string = "*"
): string {
  if (typeof str !== "string" || str.length === 0) {
    return str;
  }

  // Automatically set 'start' and 'length' if not provided
  if (typeof start !== "number" || start < 0) {
    // Default to masking from around 30% of the string length
    start = Math.max(1, Math.floor(str.length * 0.3));
  }

  if (typeof length !== "number" || length <= 0 || start >= str.length) {
    // Default to masking around 40% of the string length
    length = Math.max(1, Math.floor(str.length * 0.4));
  }

  // Calculate the end of the masked section
  const maskEnd = Math.min(start + length, str.length);

  // Create the masked section
  const maskedSection = str.slice(start, maskEnd).replace(/./g, maskChar);

  // Combine the unmasked and masked parts
  const maskedStr = str.slice(0, start) + maskedSection + str.slice(maskEnd);

  return maskedStr;
}

export async function getOrganizationPlan(
  orgId: string
): Promise<ISubscriptionPlan> {
  const org = await Organization.findById(orgId)
    .select("subscription")
    .populate({
      path: "subscription.object",
      select: "plan",
      populate: { path: "plan" },
    })
    .lean();
  if (!org?.subscription?.object?.plan) {
    throw new BadRequestError("Organization has no subscription");
  }

  return org?.subscription?.object?.plan as ISubscriptionPlan;
}

export const getContentType = (fileExt: string) => {
  switch (fileExt) {
    case 'pdf':
      return 'application/pdf'
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    default:
      return 'application/pdf'
  }
}