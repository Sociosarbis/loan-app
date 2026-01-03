export function formatMoney(num: string | number) {
  if (typeof num === 'number') {
    return num.toFixed(2)
  }
  return parseFloat(num).toFixed(2);
}