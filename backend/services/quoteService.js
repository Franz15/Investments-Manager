import YahooFinance from 'yahoo-finance2';
import fetch from 'node-fetch';

const yahooFinance = new YahooFinance();

/**
 * Obtiene la cotización en tiempo real de una inversión
 * @param {string} symbol - Símbolo de la inversión (ej: "AAPL", "BTC-USD")
 * @param {string} type - Tipo de inversión: 'stock', 'etf', 'bond', 'crypto', 'fund', 'other'
 * @param {string} currency - Moneda de la inversión
 * @returns {Promise<{price: number, currency: string, change: number, changePercent: number}>}
 */
export async function getQuote(symbol, type, currency = 'EUR', isin = null, name = null) {
  // Para fondos de inversión, intentar primero con ISIN o búsqueda por nombre
  if (type === 'fund' && !symbol && (isin || name)) {
    return await getFundQuote(isin, name, currency);
  }

  if (!symbol && !isin) {
    throw new Error('El símbolo o ISIN es requerido para obtener la cotización');
  }

  try {
    // Para criptomonedas, usar CoinGecko
    if (type === 'crypto') {
      return await getCryptoQuote(symbol, currency);
    }

    // Para fondos de inversión, intentar primero con StockEvents si hay ISIN
    if (type === 'fund' && isin) {
      try {
        const stockEventsQuote = await getStockEventsQuote(isin, symbol, currency);
        if (stockEventsQuote) {
          return stockEventsQuote;
        }
      } catch (stockEventsError) {
        // Continuar con Yahoo Finance si StockEvents falla
        console.log(`[StockEvents] No se pudo obtener cotización, intentando Yahoo Finance: ${stockEventsError.message}`);
      }
    }

    // Para acciones, ETFs, bonos, fondos, usar Yahoo Finance
    if (['stock', 'etf', 'bond', 'fund'].includes(type)) {
      return await getYahooQuote(symbol || isin, currency);
    }

    // Para otros tipos, intentar con Yahoo Finance de todas formas
    return await getYahooQuote(symbol || isin, currency);
  } catch (error) {
    // Si Yahoo Finance falla y tenemos ISIN, intentar StockEvents como fallback
    if (isin && type === 'fund') {
      try {
        const stockEventsQuote = await getStockEventsQuote(isin, symbol, currency);
        if (stockEventsQuote) {
          return stockEventsQuote;
        }
      } catch (stockEventsError) {
        // Si ambos fallan, lanzar el error original
      }
    }
    throw new Error(`No se pudo obtener la cotización para ${symbol || isin}: ${error.message}`);
  }
}

/**
 * Obtiene cotización de StockEvents.app usando ISIN o símbolo
 */
async function getStockEventsQuote(isin, symbol, currency = 'EUR') {
  try {
    // StockEvents usa formato: https://stockevents.app/es/stock/ISIN.FUND
    // O también puede ser: https://stockevents.app/es/stock/SYMBOL
    let url;
    
    if (isin) {
      // Intentar con ISIN (formato: ISIN.FUND)
      url = `https://stockevents.app/es/stock/${isin}.FUND`;
    } else if (symbol) {
      // Intentar con símbolo
      url = `https://stockevents.app/es/stock/${symbol}`;
    } else {
      return null;
    }
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': 'https://stockevents.app/',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const html = await response.text();
    
    // Buscar el precio en el HTML usando diferentes patrones
    // StockEvents probablemente tiene el precio en formato JSON embebido o en elementos específicos
    let price = null;
    let change = 0;
    let changePercent = 0;
    
    // Patrón 1: Buscar en JSON embebido (común en aplicaciones React/Next.js)
    const jsonPattern = /"price":\s*([\d,]+\.?\d*)/i;
    const jsonMatch = html.match(jsonPattern);
    if (jsonMatch && jsonMatch[1]) {
      price = parseFloat(jsonMatch[1].replace(',', '.'));
    }
    
    // Patrón 2: Buscar en atributos data-*
    if (!price) {
      const dataPricePattern = /data-price=["']([\d,]+\.?\d*)["']/i;
      const dataMatch = html.match(dataPricePattern);
      if (dataMatch && dataMatch[1]) {
        price = parseFloat(dataMatch[1].replace(',', '.'));
      }
    }
    
    // Patrón 3: Buscar en elementos con clases comunes de precio
    if (!price) {
      const classPricePattern = /class="[^"]*price[^"]*"[^>]*>[\s€$]*([\d,]+\.?\d*)/i;
      const classMatch = html.match(classPricePattern);
      if (classMatch && classMatch[1]) {
        price = parseFloat(classMatch[1].replace(',', '.'));
      }
    }
    
    // Patrón 4: Buscar cambio porcentual
    const changePattern = /([+-]?[\d,]+\.?\d*)%/i;
    const changeMatches = html.match(changePattern);
    if (changeMatches && changeMatches.length > 0) {
      // Buscar el primer porcentaje que parezca un cambio (no el precio)
      for (const match of changeMatches) {
        const percent = parseFloat(match.replace(',', '.').replace('+', '').replace('%', ''));
        if (percent !== price && Math.abs(percent) < 100) {
          changePercent = percent;
          break;
        }
      }
    }
    
    if (price && price > 0) {
      // Calcular cambio si tenemos el porcentaje
      if (changePercent !== 0) {
        change = (price * changePercent) / 100;
      }
      
      return {
        price,
        currency,
        change,
        changePercent,
        source: 'stockevents',
      };
    }
    
    return null;
  } catch (error) {
    console.error('[StockEvents] Error obteniendo cotización:', error.message);
    return null;
  }
}

/**
 * Obtiene cotización de Yahoo Finance
 */
async function getYahooQuote(symbol, currency) {
  // Extraer el símbolo base (sin sufijo de mercado)
  const baseSymbol = symbol.includes('.') ? symbol.split('.')[0] : symbol;
  const hasSuffix = symbol.includes('.');

  // Función auxiliar para intentar obtener cotización
  const tryGetQuote = async (symbolToTry) => {
    try {
      const quote = await yahooFinance.quote(symbolToTry);
      
      if (quote && quote.regularMarketPrice !== undefined && quote.regularMarketPrice !== null) {
        const price = quote.regularMarketPrice;
        const previousClose = quote.regularMarketPreviousClose || price;
        const change = price - previousClose;
        const changePercent = previousClose ? ((change / previousClose) * 100) : 0;

        return {
          price,
          currency: quote.currency || currency,
          change,
          changePercent,
          marketTime: quote.regularMarketTime,
        };
      }
    } catch (error) {
      return null;
    }
    return null;
  };

  // 1. Intentar primero con el símbolo tal cual (si tiene sufijo, probarlo primero)
  if (hasSuffix) {
    const result = await tryGetQuote(symbol);
    if (result) return result;
  }

  // 2. Intentar con el símbolo base sin sufijo
  const baseResult = await tryGetQuote(baseSymbol);
  if (baseResult) return baseResult;

  // 3. Intentar búsqueda por nombre/símbolo
  try {
    const searchSymbol = hasSuffix ? baseSymbol : symbol;
    const searchResults = await yahooFinance.search(searchSymbol);
    if (searchResults && searchResults.quotes && searchResults.quotes.length > 0) {
      // Buscar el resultado más relevante
      const bestMatch = searchResults.quotes.find(q => 
        q.symbol && (
          q.symbol.toUpperCase() === symbol.toUpperCase() ||
          q.symbol.toUpperCase() === baseSymbol.toUpperCase() ||
          q.symbol.toUpperCase().includes(baseSymbol.toUpperCase()) ||
          q.shortname?.toLowerCase().includes(baseSymbol.toLowerCase())
        )
      ) || searchResults.quotes[0];
      
      if (bestMatch && bestMatch.symbol) {
        const result = await tryGetQuote(bestMatch.symbol);
        if (result) return result;
      }
    }
  } catch (searchError) {
    // Continuar con las variantes si la búsqueda falla
  }

  // 4. Lista de variantes a probar para acciones españolas/europeas
  // Solo agregar variantes si el símbolo original no tiene sufijo
  const symbolVariants = hasSuffix 
    ? [
        symbol, // Ya probado, pero lo incluimos por si acaso
        baseSymbol, // Ya probado, pero lo incluimos por si acaso
      ]
    : [
        symbol, // Ya probado
        `${baseSymbol}.MC`, // Madrid (Mercado Continuo)
        `${baseSymbol}.MA`, // Madrid Alternativo
        `${baseSymbol}.BC`, // Barcelona
        `${baseSymbol}.AS`, // Amsterdam
        `${baseSymbol}.L`, // London
        `${baseSymbol}.PA`, // Paris
        `${baseSymbol}.DE`, // Frankfurt
        `${baseSymbol}.XETR`, // XETRA
      ];

  // Probar todas las variantes
  for (const variant of symbolVariants) {
    // Evitar duplicados (ya probamos symbol y baseSymbol)
    if (variant === symbol || variant === baseSymbol) continue;
    
    const result = await tryGetQuote(variant);
    if (result) return result;
  }

  // Si ninguna variante funcionó, lanzar error con detalles
  throw new Error(`No se encontró cotización para ${symbol}. La acción puede no estar disponible en Yahoo Finance o requiere actualización manual.`);
}

/**
 * Obtiene cotización de fondos de inversión usando ISIN o búsqueda por nombre
 */
async function getFundQuote(isin, name, currency) {
  // Intentar primero con ISIN si está disponible
  if (isin) {
    try {
      // Yahoo Finance puede buscar por ISIN en algunos casos
      // Formato: ISIN puede funcionar directamente o con prefijos
      const isinVariants = [
        isin,
        `${isin}.F`, // Fondo
        `${isin}.L`, // London
        `${isin}.PA`, // Paris
        `${isin}.DE`, // Frankfurt
      ];

      for (const variant of isinVariants) {
        try {
          const quote = await yahooFinance.quote(variant);
          if (quote && quote.regularMarketPrice) {
            const price = quote.regularMarketPrice;
            const previousClose = quote.regularMarketPreviousClose || price;
            const change = price - previousClose;
            const changePercent = previousClose ? ((change / previousClose) * 100) : 0;

            return {
              price,
              currency: quote.currency || currency,
              change,
              changePercent,
              marketTime: quote.regularMarketTime,
            };
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      // Continuar con búsqueda por nombre si ISIN falla
    }
  }

  // Si no funciona con ISIN, intentar búsqueda por nombre
  if (name) {
    try {
      const searchResults = await yahooFinance.search(name);
      if (searchResults && searchResults.quotes && searchResults.quotes.length > 0) {
        // Buscar el resultado más relevante (que sea un fondo)
        const fundMatch = searchResults.quotes.find(q => 
          q.quoteType === 'MUTUALFUND' || 
          q.quoteType === 'FUND' ||
          (q.shortname && q.shortname.toLowerCase().includes(name.toLowerCase()))
        ) || searchResults.quotes[0];
        
        if (fundMatch && fundMatch.symbol) {
          const quote = await yahooFinance.quote(fundMatch.symbol);
          if (quote && quote.regularMarketPrice) {
            const price = quote.regularMarketPrice;
            const previousClose = quote.regularMarketPreviousClose || price;
            const change = price - previousClose;
            const changePercent = previousClose ? ((change / previousClose) * 100) : 0;

            return {
              price,
              currency: quote.currency || currency,
              change,
              changePercent,
              marketTime: quote.regularMarketTime,
            };
          }
        }
      }
    } catch (error) {
      // Búsqueda por nombre falló
    }
  }

  throw new Error(`No se encontró cotización para el fondo. Intenta agregar un ISIN o símbolo específico.`);
}

/**
 * Obtiene cotización de criptomonedas usando CoinGecko
 */
async function getCryptoQuote(symbol, currency = 'EUR') {
  try {
    // Mapear símbolos comunes a IDs de CoinGecko
    const cryptoMap = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'BNB': 'binancecoin',
      'SOL': 'solana',
      'ADA': 'cardano',
      'XRP': 'ripple',
      'DOT': 'polkadot',
      'DOGE': 'dogecoin',
      'MATIC': 'matic-network',
      'LTC': 'litecoin',
    };

    // Limpiar el símbolo (puede venir como "BTC-USD" o "BTC")
    const cleanSymbol = symbol.split('-')[0].toUpperCase();
    const coinId = cryptoMap[cleanSymbol] || cleanSymbol.toLowerCase();

    // Mapear monedas
    const currencyMap = {
      'EUR': 'eur',
      'USD': 'usd',
      'GBP': 'gbp',
    };
    const vsCurrency = currencyMap[currency] || 'eur';

    // Intentar obtener el precio
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}&include_24hr_change=true`
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data[coinId]) {
      // Si no se encuentra por ID, intentar buscar por símbolo
      const searchResponse = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${cleanSymbol.toLowerCase()}&vs_currencies=${vsCurrency}&include_24hr_change=true`
      );
      
      if (!searchResponse.ok) {
        throw new Error(`Criptomoneda ${symbol} no encontrada`);
      }
      
      const searchData = await searchResponse.json();
      const coinData = searchData[cleanSymbol.toLowerCase()];
      
      if (!coinData) {
        throw new Error(`Criptomoneda ${symbol} no encontrada`);
      }

      return {
        price: coinData[vsCurrency],
        currency: currency.toUpperCase(),
        change: coinData[`${vsCurrency}_24h_change`] ? (coinData[vsCurrency] * coinData[`${vsCurrency}_24h_change`] / 100) : 0,
        changePercent: coinData[`${vsCurrency}_24h_change`] || 0,
      };
    }

    const coinData = data[coinId];

    return {
      price: coinData[vsCurrency],
      currency: currency.toUpperCase(),
      change: coinData[`${vsCurrency}_24h_change`] ? (coinData[vsCurrency] * coinData[`${vsCurrency}_24h_change`] / 100) : 0,
      changePercent: coinData[`${vsCurrency}_24h_change`] || 0,
    };
  } catch (error) {
    // Si CoinGecko falla, intentar con Yahoo Finance
    try {
      // Yahoo Finance usa formato como "BTC-EUR" o "BTC-USD"
      const yahooSymbol = symbol.includes('-') ? symbol : `${symbol}-${currency}`;
      return await getYahooQuote(yahooSymbol, currency);
    } catch (yahooError) {
      throw new Error(`Error obteniendo cotización de criptomoneda: ${error.message}`);
    }
  }
}

/**
 * Actualiza los precios de múltiples inversiones
 * @param {Array} investments - Array de inversiones con symbol y type
 * @returns {Promise<Array>} Array de resultados con price actualizado
 */
export async function updateMultipleQuotes(investments) {
  const results = [];
  
  // Yahoo Finance permite ~33 llamadas/minuto (2,000/hora)
  // Usamos 2 segundos entre llamadas para ser conservadores (30 llamadas/minuto)
  const delayBetweenCalls = 2000; // 2 segundos
  
  // Procesar una por una para respetar el rate limit estrictamente
  for (let i = 0; i < investments.length; i++) {
    const investment = investments[i];
    
    try {
      // Filtrar inversiones sin símbolo o que sean carteras automatizadas
      if (!investment.symbol || investment.isAutomatedPortfolio) {
        results.push({
          investmentId: investment._id?.toString() || investment.id?.toString(),
          symbol: investment.symbol || 'N/A',
          success: false,
          error: investment.isAutomatedPortfolio ? 'Cartera automatizada (actualización manual)' : 'No tiene símbolo definido',
        });
        continue; // No hacer delay para estas
      }

      const quote = await getQuote(
        investment.symbol,
        investment.type,
        investment.currency,
        investment.isin,
        investment.name
      );

      results.push({
        investmentId: investment._id?.toString() || investment.id?.toString(),
        symbol: investment.symbol,
        success: true,
        price: quote.price,
        currency: quote.currency,
        change: quote.change,
        changePercent: quote.changePercent,
      });
    } catch (error) {
      results.push({
        investmentId: investment._id?.toString() || investment.id?.toString(),
        symbol: investment.symbol || 'N/A',
        success: false,
        error: error.message,
      });
    }

    // Esperar entre llamadas para respetar el rate limit (excepto en la última)
    if (i < investments.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
    }
  }

  return results;
}

