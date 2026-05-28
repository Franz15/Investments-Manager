import fetch from 'node-fetch';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  Referer: 'https://www.morningstar.es/',
};

/**
 * Resolves an ISIN to a Morningstar secId via their search API.
 * Returns null if not found.
 */
async function resolveIsin(isin) {
  const url = `https://www.morningstar.com/api/v2/search/securities?q=${encodeURIComponent(isin)}&types=fund&limit=1`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;

  const data = await res.json();
  const results = data?.results ?? data?.funds ?? [];
  if (!results.length) return null;

  // Prefer exact ISIN match
  const exact = results.find((r) => r.isin === isin || r.isinCode === isin || r.id === isin);
  const hit = exact ?? results[0];
  return hit?.secId ?? hit?.id ?? null;
}

/**
 * Fetches trailing returns and standard deviation for a Morningstar secId.
 * Returns { return12M, volatility12M } as percentage strings, or nulls.
 */
async function fetchMetrics(secId) {
  const url =
    `https://lt.morningstar.com/api/rest.svc/v2/security_details/${secId}` +
    `?viewId=snapshot&idtype=Morningstar&languageId=es-ES&currencyId=EUR&outputType=json`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return { return12M: null, volatility12M: null };

  const data = await res.json();

  // Morningstar nests data under different shapes — try common paths
  const perf =
    data?.TrailingReturn?.['1Year']?.Value ??
    data?.trailingReturn?.['1year']?.value ??
    data?.fund?.trailingReturn?.trailing1YrPct ??
    null;

  const vol =
    data?.RiskStatistics?.StandardDeviation?.['1Year']?.Value ??
    data?.riskStatistics?.standardDeviation?.['1year']?.value ??
    data?.fund?.riskStatistics?.std1YrPct ??
    null;

  return {
    return12M: perf != null ? `${Number(perf).toFixed(2)}%` : null,
    volatility12M: vol != null ? `${Number(vol).toFixed(2)}%` : null,
  };
}

/**
 * Full pipeline: ISIN → secId → metrics.
 * Returns { return12M, volatility12M, secId } or nulls if anything fails.
 */
export async function refreshMetricsByIsin(isin) {
  if (!isin) return { return12M: null, volatility12M: null, secId: null };

  try {
    console.log(`[Morningstar] Resolving ISIN ${isin}…`);
    const secId = await resolveIsin(isin);
    if (!secId) {
      console.warn(`[Morningstar] ISIN ${isin} not found in search`);
      return { return12M: null, volatility12M: null, secId: null };
    }

    console.log(`[Morningstar] secId=${secId} — fetching metrics…`);
    const metrics = await fetchMetrics(secId);
    console.log(`[Morningstar] ${isin} →`, metrics);
    return { ...metrics, secId };
  } catch (err) {
    console.error(`[Morningstar] Error for ISIN ${isin}:`, err.message);
    return { return12M: null, volatility12M: null, secId: null };
  }
}
