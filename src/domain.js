import { RequestError } from './database.js';

export const types = {
  bac: 'BAC documentation',
  advance: 'Advance payment',
  progress: 'Progress billing',
  final: 'Final billing',
  retention: 'Retention claim',
};
export const statusNames = ['Pending', 'Under Audit', 'Suspended', 'Resubmitted', 'Audited'];
export const checklistStates = ['Unchecked', 'Checked', 'N/A'];
export const roles = ['intake', 'auditor', 'supervisor', 'system-admin'];
export const auditRoles = ['auditor', 'supervisor'];
export const registerRoles = ['intake', ...auditRoles];
export const movementKinds = ['register', 'start', 'suspend', 'resubmit', 'resume', 'certify', 'void'];

const manilaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila' });
export const today = () => manilaDate.format(new Date());

export function text(value, label, max = 1000, required = false) {
  if (value == null || value === '') {
    if (required) throw new RequestError(400, `${label} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new RequestError(400, `${label} must be text.`);
  const clean = value.trim();
  if (!clean && required) throw new RequestError(400, `${label} is required.`);
  if (clean.length > max || clean.includes('\0')) {
    throw new RequestError(400, `${label} must contain at most ${max} characters and no null characters.`);
  }
  return clean || null;
}

export function date(value, label, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    throw new RequestError(400, `${label} must be a valid date.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RequestError(400, `${label} must be a valid date.`);
  }
  return value;
}

export function id(value, label = 'Record') {
  const number = Number(value);
  if (!['string', 'number'].includes(typeof value) ||
      !/^\d+$/.test(String(value)) ||
      !Number.isInteger(number) || number < 1 || number > 2147483647) {
    throw new RequestError(400, `${label} is invalid.`);
  }
  return number;
}

export function oneOf(value, choices, label) {
  if (!choices.includes(value)) throw new RequestError(400, `${label} is invalid.`);
  return value;
}

export function amount(value, label) {
  const input = text(value, label, 23);
  if (input == null) return null;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input)) {
    throw new RequestError(400, `Enter ${label.toLowerCase()} in pesos with at most two decimal places.`);
  }
  const [whole, fraction = ''] = input.replaceAll(',', '').split('.');
  const normalized = BigInt(whole).toString();
  if (normalized.length > 13) throw new RequestError(400, `${label} is too large.`);
  return `${normalized}.${fraction.padEnd(2, '0')}`;
}

const smallNumbers = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const groups = ['', 'thousand', 'million', 'billion', 'trillion'];

function underThousand(number) {
  const parts = [];
  if (number >= 100) {
    parts.push(`${smallNumbers[Math.floor(number / 100)]} hundred`);
    number %= 100;
  }
  if (number < 20) {
    if (number || !parts.length) parts.push(smallNumbers[number]);
  } else {
    const units = number % 10;
    const decade = tens[Math.floor(number / 10)];
    parts.push(units ? `${decade}-${smallNumbers[units]}` : decade);
  }
  return parts.join(' ');
}

function numberInWords(number) {
  const parts = [];
  for (let group = 0; number > 0n; group++, number /= 1000n) {
    const chunk = Number(number % 1000n);
    if (chunk) parts.unshift([underThousand(chunk), groups[group]].filter(Boolean).join(' '));
  }
  return parts.join(' ') || 'zero';
}

export function amountForCopy(value) {
  const [whole, fraction] = value.split('.');
  const pesos = BigInt(whole);
  const centavos = Number(fraction);
  return {
    figures: `₱${pesos.toLocaleString('en-PH')}.${fraction}`,
    words: `${numberInWords(pesos)} ${pesos === 1n ? 'peso' : 'pesos'} and ` +
      `${underThousand(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`,
  };
}
