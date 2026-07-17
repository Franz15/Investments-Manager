/**
 * Formatea precios con 4 decimales, pero muestra solo 2 si los dos últimos son 00
 */
export const formatPrice = (value, currency = 'EUR') => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0,00 €';
  }

  const decimalPart = Math.abs((value * 10000) % 100);
  const hasTrailingZeros = decimalPart === 0;
  const decimals = hasTrailingZeros ? 2 : 4;

  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};
