/** 金额比较和求和保留十进制，不用浮点运算决定实际付款金额。 */
export function normalizeAmount(value: string | number): string {
  let text = String(value).trim();
  const parts = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!parts || text.length > 4096) throw new Error('金额信息无效，请刷新后重试');
  if (parts[3] != null) {
    // BigDecimal 的零值会返回 0E-8，小额数值也可能带指数；逐位移动小数点，不先转浮点。
    const exponent = Number(parts[3]);
    const digits = parts[1] + (parts[2] || '');
    const point = parts[1].length + exponent;
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 4096 || Math.max(point, digits.length - point) > 4096) throw new Error('金额位数超出可核对范围');
    text = point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
      : point >= digits.length ? digits + '0'.repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  const [whole, fraction = ''] = text.split('.');
  const integer = whole.replace(/^0+(?=\d)/, '');
  const decimal = fraction.replace(/0+$/, '');
  return decimal ? `${integer}.${decimal}` : integer;
}

export function sumAmounts(values: Array<string | number>): string {
  const parts = values.map(value => normalizeAmount(value).split('.'));
  const scale = Math.max(0, ...parts.map(([, fraction = '']) => fraction.length));
  let sum = '0';
  for (const [whole, fraction = ''] of parts) {
    const digits = whole + fraction.padEnd(scale, '0');
    let carry = 0;
    let next = '';
    for (let a = sum.length - 1, b = digits.length - 1; a >= 0 || b >= 0 || carry; a--, b--) {
      const digit = Number(sum[a] || 0) + Number(digits[b] || 0) + carry;
      next = String(digit % 10) + next;
      carry = Math.floor(digit / 10);
    }
    sum = next;
  }
  const padded = sum.padStart(scale + 1, '0');
  return normalizeAmount(scale ? `${padded.slice(0, -scale)}.${padded.slice(-scale)}` : padded);
}
