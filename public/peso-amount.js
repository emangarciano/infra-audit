export function parsePesoAmount(input) {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input)) {
    return { error: 'format' };
  }
  const [digits, fraction = ''] = input.replaceAll(',', '').split('.');
  const whole = BigInt(digits).toString();
  if (whole.length > 13) return { error: 'size' };
  return { value: `${whole}.${fraction.padEnd(2, '0')}` };
}
