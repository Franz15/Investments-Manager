import YahooFinanceClass from 'yahoo-finance2';

const yahooFinance = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

// Sufijos de bolsa donde suelen cotizar fondos UCITS europeos en Yahoo Finance
const YAHOO_EXCHANGES = ['F', 'L', 'MI', 'PA', 'AS', 'SW', 'MC'];

const MS_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  Referer: 'https://www.morningstar.es/',
};

/**
 * ISIN → { secId, portfolioId, starRating } vía Morningstar SecuritySearch.ashx.
 * Formato respuesta: "Nombre|{json}|FUND|||Categoría"
 * El JSON tiene: i (secId), pi (portfolioId), sr (star rating 1-5)
 */
async function resolveIsin(isin) {
  const url = `https://www.morningstar.es/es/util/SecuritySearch.ashx?q=${encodeURIComponent(isin)}&markets=&limit=1`;
  const res = await fetch(url, { headers: MS_HEADERS });
  if (!res.ok) return null;

  const text = await res.text();
  if (!text || !text.includes('|')) return null;

  const parts = text.split('|');
  if (parts.length < 2) return null;

  try {
    const data = JSON.parse(parts[1]);
    return {
      secId: data.i ?? null,
      portfolioId: data.pi ?? null,
      starRating: data.sr ? Number(data.sr) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Calcula retorno total entre el precio de hace `years` años y el precio actual.
 * - 1 año: retorno acumulado (no anualizado)
 * - >1 año: retorno anualizado (CAGR)
 */
function calcReturn(quotes, years) {
  if (!quotes.length) return null;
  const currentPrice = quotes.at(-1)?.close;
  if (!currentPrice) return null;

  const targetDate = new Date();
  targetDate.setFullYear(targetDate.getFullYear() - years);

  // Buscar el primer dato a partir de la fecha objetivo
  const pastEntry = quotes.find((q) => q.date >= targetDate);
  if (!pastEntry?.close) return null;

  const ratio = currentPrice / pastEntry.close;
  const actualYears = (quotes.at(-1).date - pastEntry.date) / (365.25 * 24 * 60 * 60 * 1000);

  if (actualYears < years * 0.8) return null; // Datos insuficientes

  let pct;
  if (years <= 1) {
    pct = (ratio - 1) * 100; // Acumulado
  } else {
    pct = (Math.pow(ratio, 1 / actualYears) - 1) * 100; // Anualizado (CAGR)
  }

  return `${pct.toFixed(2)}%`;
}

/**
 * Calcula la volatilidad anualizada (desviación estándar de retornos mensuales × √12)
 * para los últimos `months` meses.
 */
function calcVolatility(quotes, months) {
  const slice = quotes.slice(-months - 1);
  if (slice.length < months * 0.8) return null;

  const monthlyReturns = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].close;
    const curr = slice[i].close;
    if (prev && curr) monthlyReturns.push(curr / prev - 1);
  }

  if (monthlyReturns.length < 6) return null;

  const mean = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
  const variance =
    monthlyReturns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / monthlyReturns.length;

  return `${(Math.sqrt(variance * 12) * 100).toFixed(2)}%`;
}

/**
 * Busca el símbolo de Yahoo Finance para un portfolioId de Morningstar.
 * Prueba {portfolioId}.{exchange} en los exchanges europeos habituales.
 * Devuelve el primer símbolo con precio válido, o null.
 */
async function findYahooSymbol(portfolioId) {
  if (!portfolioId) return null;

  for (const exchange of YAHOO_EXCHANGES) {
    const symbol = `${portfolioId}.${exchange}`;
    try {
      const quote = await yahooFinance.quote(symbol, {}, { validateResult: false });
      if (quote?.regularMarketPrice) return symbol;
    } catch {
      // siguiente exchange
    }
  }
  return null;
}

/**
 * Obtiene retornos y volatilidad de un fondo vía Yahoo Finance.
 * Usa 10 años de datos históricos mensuales para calcular todas las métricas.
 */
async function fetchYahooMetrics(portfolioId) {
  const symbol = await findYahooSymbol(portfolioId);
  if (!symbol) return null;

  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 10);

  const hist = await yahooFinance.chart(
    symbol,
    { period1: start, period2: end, interval: '1mo' },
    { validateResult: false }
  );

  const quotes = (hist?.quotes ?? []).filter((q) => q.close != null);
  if (quotes.length < 12) return null;

  return {
    return12M: calcReturn(quotes, 1),
    return3Y: calcReturn(quotes, 3),
    return5Y: calcReturn(quotes, 5),
    return10Y: calcReturn(quotes, 10),
    volatility12M: calcVolatility(quotes, 12),
    volatility3Y: calcVolatility(quotes, 36),
    volatility5Y: calcVolatility(quotes, 60),
    yahooSymbol: symbol,
  };
}

/**
 * Pipeline completo: ISIN → todas las métricas disponibles.
 *
 * Fuentes:
 *   - Morningstar SecuritySearch.ashx → secId, starRating
 *   - Yahoo Finance (portfolioId.Exchange) → retornos 12M/3Y/5Y/10Y, volatilidad 12M/3Y/5Y
 */
export async function refreshMetricsByIsin(isin) {
  const empty = {
    return12M: null,
    return3Y: null,
    return5Y: null,
    return10Y: null,
    volatility12M: null,
    volatility3Y: null,
    volatility5Y: null,
    ratingOverall: null,
    morningstarCategory: null,
    managementCompany: null,
    secId: null,
  };

  if (!isin) return empty;

  try {
    console.log(`[Metrics] ISIN ${isin}…`);

    // 1. Morningstar → secId + star rating + portfolioId
    const resolved = await resolveIsin(isin);
    if (!resolved?.secId) {
      console.warn(`[Metrics] ${isin} no encontrado en Morningstar`);
      return empty;
    }

    const { secId, portfolioId, starRating } = resolved;
    console.log(`[Metrics] ${isin} → secId=${secId} pi=${portfolioId} sr=${starRating}`);

    // 2. Yahoo Finance → retornos y volatilidad
    let yahooData = null;
    if (portfolioId) {
      try {
        yahooData = await fetchYahooMetrics(portfolioId);
        if (yahooData) {
          console.log(
            `[Metrics] ${isin} Yahoo (${yahooData.yahooSymbol}): 12M=${yahooData.return12M} vol=${yahooData.volatility12M}`
          );
        } else {
          console.warn(`[Metrics] ${isin} no encontrado en Yahoo Finance`);
        }
      } catch (err) {
        console.warn(`[Metrics] ${isin} Yahoo error: ${err.message}`);
      }
    }

    return {
      ...empty,
      ratingOverall: starRating ?? null,
      secId,
      return12M: yahooData?.return12M ?? null,
      return3Y: yahooData?.return3Y ?? null,
      return5Y: yahooData?.return5Y ?? null,
      return10Y: yahooData?.return10Y ?? null,
      volatility12M: yahooData?.volatility12M ?? null,
      volatility3Y: yahooData?.volatility3Y ?? null,
      volatility5Y: yahooData?.volatility5Y ?? null,
    };
  } catch (err) {
    console.error(`[Metrics] Error para ISIN ${isin}:`, err.message);
    return empty;
  }
}
