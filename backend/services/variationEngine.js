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

    if (isCapitalOperation(entry.operation)) {
      existing.capitalChange += getSignedOperationAmount(entry);
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
    const preferredEntry = day.lastUpdateEntry || day.lastEntry;
    let endValue = null;
    let capitalChange = day.capitalChange;

    if (
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

    if (
      preferredEntry &&
      preferredEntry.quantity !== null &&
      preferredEntry.quantity !== undefined
    ) {
      if (lastQuantity !== null && capitalChange === 0) {
        const quantityDelta = preferredEntry.quantity - lastQuantity;
        if (quantityDelta !== 0) {
          const implicitPrice =
            preferredEntry.currentPrice ||
            (preferredEntry.totalValue && preferredEntry.quantity
              ? preferredEntry.totalValue / preferredEntry.quantity
              : 0);
          const implicitChange = quantityDelta * implicitPrice;
          if (implicitChange !== 0) {
            capitalChange += implicitChange;
          }
        }
      }
      lastQuantity = preferredEntry.quantity;
    }

    let changeAmount = 0;
    let changePercent = 0;
    if (lastValue !== null && lastValue !== undefined && lastValue > 0) {
      changeAmount = endValue - lastValue - capitalChange;
      changePercent = lastValue !== 0 ? (changeAmount / lastValue) * 100 : 0;
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
