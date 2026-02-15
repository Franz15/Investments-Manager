const normalizeDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEntryStamp = (entry) =>
  entry.updatedAt ||
  entry.createdAt ||
  entry.date ||
  entry._id?.getTimestamp?.() ||
  null;

const resolveOperationAmount = (entry) => {
  let amount = entry?.operationAmount;
  if (!amount || amount === 0) {
    if (entry?.operationPrice && entry?.quantity) {
      amount = entry.operationPrice * entry.quantity;
    } else if (entry?.operation === "creation" && entry?.totalValue) {
      amount = entry.totalValue;
    }
  }
  return amount || 0;
};

const isCapitalOperation = (operation) =>
  ["creation", "add", "withdraw", "sell"].includes(operation);

const getSignedOperationAmount = (entry) => {
  if (!isCapitalOperation(entry?.operation)) return 0;
  const amount = resolveOperationAmount(entry);
  if (entry.operation === "withdraw" || entry.operation === "sell") {
    return -Math.abs(amount);
  }
  return amount;
};

const buildDailyMapFromHistory = (historyEntries) => {
  const dayMap = new Map();

  historyEntries.forEach((entry) => {
    const day = normalizeDay(entry.date);
    const key = day.getTime();
    const existing = dayMap.get(key) || {
      date: day,
      capitalChange: 0,
      lastEntry: null,
      lastEntryStamp: null,
      lastUpdateEntry: null,
      lastUpdateStamp: null,
      maxQtyEntry: null,
      hasCloseOperation: false,
      hasCapitalOperation: false,
    };

    if (entry.totalValue !== null && entry.totalValue !== undefined) {
      const stamp = getEntryStamp(entry);
      if (
        !existing.lastEntryStamp ||
        (stamp && stamp > existing.lastEntryStamp)
      ) {
        existing.lastEntry = entry;
        existing.lastEntryStamp = stamp || entry.date;
      }
      if (
        entry.operation === "update" &&
        (!existing.lastUpdateStamp ||
          (stamp && stamp > existing.lastUpdateStamp))
      ) {
        existing.lastUpdateEntry = entry;
        existing.lastUpdateStamp = stamp || entry.date;
      }
    }

    // Trackear la entrada con mayor cantidad de participaciones del día
    // (útil para detectar el estado post-aportación correcto)
    if (entry.quantity !== null && entry.quantity !== undefined) {
      if (
        !existing.maxQtyEntry ||
        entry.quantity > (existing.maxQtyEntry.quantity || 0)
      ) {
        existing.maxQtyEntry = entry;
      }
    }

    // Detectar operaciones de cierre (withdraw/sell que dejan quantity=0 o totalValue=0)
    if (
      (entry.operation === "withdraw" || entry.operation === "sell") &&
      (entry.quantity === 0 || entry.totalValue === 0)
    ) {
      existing.hasCloseOperation = true;
    }

    if (isCapitalOperation(entry.operation)) {
      existing.capitalChange += getSignedOperationAmount(entry);
      existing.hasCapitalOperation = true;
    }

    dayMap.set(key, existing);
  });

  return dayMap;
};

const buildDailyVariationsFromHistory = (historyEntries, previousEndValue) => {
  const dayMap = buildDailyMapFromHistory(historyEntries);
  const days = Array.from(dayMap.values()).sort((a, b) => a.date - b.date);
  const result = [];
  let lastValue = previousEndValue;
  let lastQuantity = null;

  days.forEach((day) => {
    // Selección de entrada preferida:
    // 1. Cierre: usar lastEntry (endValue será 0)
    // 2. Aportación (capitalChange > 0): usar maxQtyEntry (estado post-aportación)
    // 3. Normal: preferir lastUpdateEntry sobre lastEntry
    const preferredEntry = day.hasCloseOperation
      ? day.lastEntry
      : day.hasCapitalOperation && day.capitalChange > 0 && day.maxQtyEntry
        ? day.maxQtyEntry
        : day.lastUpdateEntry || day.lastEntry;
    let endValue = null;
    let capitalChange = day.capitalChange;

    // Si es una operación de cierre, endValue siempre es 0
    if (day.hasCloseOperation) {
      endValue = 0;
    } else if (
      preferredEntry &&
      preferredEntry.totalValue !== null &&
      preferredEntry.totalValue !== undefined
    ) {
      endValue = preferredEntry.totalValue;
    } else if (lastValue !== null && lastValue !== undefined) {
      if (capitalChange !== 0) {
        endValue = lastValue + capitalChange;
      } else {
        endValue = lastValue;
      }
    } else if (day.capitalChange !== 0) {
      endValue = capitalChange;
    }

    if (endValue === null || endValue === undefined) {
      return;
    }

    // Cálculo del capitalChange basado en cambio REAL de participaciones.
    // Más fiable que operationAmount porque:
    // - Detecta participaciones silenciosas (DCA no registrado)
    // - Ignora operaciones fantasma donde la cantidad no cambió
    // - Para cierres, mantiene el capitalChange original (basado en operationAmount)
    if (
      preferredEntry &&
      preferredEntry.quantity !== null &&
      preferredEntry.quantity !== undefined
    ) {
      if (lastQuantity !== null && !day.hasCloseOperation) {
        const quantityDelta = preferredEntry.quantity - lastQuantity;
        if (quantityDelta !== 0) {
          const implicitPrice =
            preferredEntry.currentPrice ||
            (preferredEntry.totalValue && preferredEntry.quantity
              ? preferredEntry.totalValue / preferredEntry.quantity
              : 0);
          // Reemplazar capitalChange con el cambio basado en participaciones
          capitalChange = quantityDelta * implicitPrice;
        } else if (day.hasCapitalOperation) {
          // La cantidad no cambió a pesar de tener operación de capital
          // → operación fantasma (ej: dinero fue a subcuenta de efectivo)
          capitalChange = 0;
        }
      }
      lastQuantity = preferredEntry.quantity;
    }

    let changeAmount = 0;
    let changePercent = 0;
    if (lastValue !== null && lastValue !== undefined && lastValue > 0) {
      changeAmount = endValue - lastValue - capitalChange;
      changePercent = lastValue !== 0 ? (changeAmount / lastValue) * 100 : 0;
    } else if (
      (lastValue === null || lastValue === undefined || lastValue === 0) &&
      capitalChange > 0
    ) {
      // Primera operación (creación/aportación): capturar la ganancia/pérdida
      // entre el capital aportado y el valor de mercado registrado
      changeAmount = endValue - capitalChange;
      changePercent =
        capitalChange > 0 ? (changeAmount / capitalChange) * 100 : 0;
    }

    result.push({
      date: day.date,
      totalValue: endValue,
      changeAmount,
      changePercent,
      capitalChange,
    });

    lastValue = endValue;
  });

  return result;
};

export {
  normalizeDay,
  resolveOperationAmount,
  isCapitalOperation,
  getSignedOperationAmount,
  buildDailyMapFromHistory,
  buildDailyVariationsFromHistory,
};
