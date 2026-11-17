// Cursores para recorrer historiales ordenados por `key` ascendente en un bucle de fechas.
// Se consultan con claves crecientes; cada entrada se visita una sola vez.

// Última entrada con key <= clave. En empate de `time` exacto gana la primera,
// igual que un sort estable descendente por fecha seguido de [0].
export function latestCursor(items) {
  let i = 0;
  let latest = null;
  return (key) => {
    while (i < items.length && items[i].key <= key) {
      if (!latest || items[i].time !== latest.time) latest = items[i];
      i++;
    }
    return latest;
  };
}

// Suma acumulada de `amount` de las entradas con key <= clave.
export function sumCursor(items) {
  let i = 0;
  let sum = 0;
  return (key) => {
    while (i < items.length && items[i].key <= key) sum += items[i++].amount;
    return sum;
  };
}
