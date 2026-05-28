/**
 * Datos del Portfolio Builder copiados del Excel (Cartera1).
 * Fuente de verdad embebida: la app no depende de cargar el archivo Excel.
 * Para cambiar asignaciones o fondos, edita este fichero.
 */

/** Asignación de cartera (calculadora): total, categorías con peso y retorno esperado */
export const DEFAULT_PORTFOLIO_ALLOCATION = {
  totalAmountCalculated: 120000,
  totalReturn: '5.73%',
  categories: [
    {
      name: 'Monetarios',
      expectedReturn: '2.00%',
      weight: '0%',
      portfolioReturn: '0.00%',
      amount: 0,
      description: null,
    },
    {
      name: 'RF Corto',
      expectedReturn: '4.00%',
      weight: '40%',
      portfolioReturn: '1.60%',
      amount: 48000,
      description: null,
    },
    {
      name: 'RF Medio',
      expectedReturn: '5.50%',
      weight: '25%',
      portfolioReturn: '1.38%',
      amount: 30000,
      description: null,
    },
    {
      name: 'RV',
      expectedReturn: '9%',
      weight: '25%',
      portfolioReturn: '2.25%',
      amount: 30000,
      description: null,
    },
    {
      name: 'Alternativos',
      expectedReturn: '5%',
      weight: '10%',
      portfolioReturn: '0.50%',
      amount: 12000,
      description: null,
    },
  ],
};

/**
 * Descripciones por sección (del Excel Cartera1).
 * Se usan como "clave" para que translateDescription() devuelva la traducción (es/cat).
 * 2 = Monetarios, 3 = Renta Variable.
 */
export const DEFAULT_SECTION_DESCRIPTIONS = {
  2: 'Máxima rentabilidad que puedes obtener del activo libre de riesgo. No es una promoción (puedes estar el tiempo que quieras). Difieres impuestos (no pagas hasta que vendes). Liquidez diaria.',
  3: 'Inversión en empresas de primer nivel a largo plazo (con riesgo) para hacer la bola de nieve del interés compuesto.',
};

/**
 * Tips / comentarios por sección (del Excel Cartera1).
 * Se traducen con translateTip() al mostrar.
 * 3 = Renta Variable (consejo sobre caídas).
 */
export const DEFAULT_SECTION_TIPS = {
  3: [
    'En caso de caidas fuertes en la RV, utilizar parte del dinero de monetarios para compras adicionales',
  ],
};

/** Vídeos educativos por sección (del Excel Cartera1). Clave = número de sección (2 Monetarios, 3 RV, 4 Renta Fija, 5 Alternativos). */
export const DEFAULT_SECTION_VIDEOS = {
  2: [
    {
      url: 'https://youtu.be/GJCm99xWUJE',
      description: 'Ejemplo compra de Groupama min 13:30',
    },
    {
      url: 'https://youtu.be/UseVRu7tVpQ',
      description: 'Explicación fondos monetarios',
    },
  ],
  3: [
    {
      url: 'https://www.youtube.com/watch?v=Au98IMqZV7U',
      description: 'Automatizando indexados en myinvestor',
    },
  ],
  4: [{ url: 'https://youtu.be/bkYK-akFam4', description: 'Renta fija y bonos' }],
  5: [],
};
