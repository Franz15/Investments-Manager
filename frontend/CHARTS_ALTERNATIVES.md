# Alternativas de librerías de gráficas

Resumen de opciones si quieres cambiar o ampliar las gráficas del dashboard.

## Actual

- **Recharts**: usada en el dashboard para evolución de patrimonio, área, donut por clase de activo, evolución de inversiones, treemap por inversión.
- **Bar List propio**: la sección "Distribución por banco" usa un componente **Bar List** (lista de barras horizontales) hecho con Tailwind, sin Recharts.

---

## Librerías alternativas

### Chart.js + react-chartjs-2

- **Uso**: gráficas clásicas (bar, line, doughnut, etc.) con buena personalización.
- **Instalación**: `npm install chart.js react-chartjs-2`
- **Ventajas**: muy usada, documentación amplia, funciona con React 18, sin depender de Tailwind.
- **Inconvenientes**: hay que registrar elementos (ArcElement, Tooltip, Legend, etc.) antes de usar cada tipo de gráfica.

### Apache ECharts + echarts-for-react

- **Uso**: dashboards con muchos tipos de gráficas y opciones de estilo.
- **Instalación**: `npm install echarts echarts-for-react`
- **Ventajas**: muchas variantes (line, bar, pie, gauge, treemap, etc.), temas y animaciones.
- **Inconvenientes**: bundle más grande; la API se configura por un objeto `option`.

### Tremor (@tremor/react)

- **Uso**: dashboards y componentes de datos con diseño cuidado.
- **Instalación**: `npm install @tremor/react` (requiere **Tailwind CSS v4.0+**).
- **Ventajas**: AreaChart, BarChart, DonutChart, BarList, etc., integrados con Tailwind y buen aspecto por defecto.
- **Inconvenientes**: el proyecto usa Tailwind v3; migrar a v4 puede ser un cambio grande.

### Lightweight Charts (TradingView)

- **Uso**: gráficas financieras (series temporales, velas, etc.).
- **Instalación**: `npm install lightweight-charts`
- **Ventajas**: muy adecuada para precios y series en tiempo real.
- **Inconvenientes**: orientada a trading; no sustituye a gráficas genéricas (donut, barras por categoría, etc.).

---

## Recomendación

- Para **sustituir Recharts** en todo el dashboard: **Chart.js (react-chartjs-2)** o **ECharts (echarts-for-react)** son las opciones más directas sin tocar Tailwind.
- Para **añadir más gráficas** manteniendo Recharts: se puede seguir mezclando Recharts con componentes propios (como el Bar List de bancos) o ir introduciendo Chart.js/ECharts solo donde interese.
