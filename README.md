# Investments Manager

Dashboard moderno para gestionar cuentas bancarias, transacciones e inversiones con seguimiento en tiempo real y gráficas interactivas.

## 🚀 Características

- **Gestión de Cuentas**: Crea y gestiona múltiples cuentas bancarias y de inversión
- **Transacciones**: Registra ingresos, gastos y transferencias
- **Inversiones**: Gestiona tu cartera de inversiones con seguimiento de ganancias/pérdidas
- **Dashboard Interactivo**: Visualiza estadísticas y gráficas de tus finanzas
- **UI Moderna**: Interfaz responsive y fácil de usar con Tailwind CSS

## 🛠️ Tecnologías

### Backend
- Node.js + Express
- MongoDB + Mongoose
- RESTful API

### Frontend
- React 18
- Vite
- Tailwind CSS
- Recharts (gráficas)
- React Router
- Axios

## 📋 Requisitos Previos

- Node.js (v16 o superior)
- MongoDB (local o remoto)
- npm o yarn

## 🔧 Instalación

### 1. Clonar el repositorio

```bash
git clone <tu-repositorio>
cd Investments-Manager
```

### 2. Configurar Backend

```bash
cd backend
npm install
```

**Configurar variables de entorno:**

Opción 1 - Usar el script automático (recomendado):
```bash
npm run setup-env
```

Opción 2 - Crear manualmente el archivo `.env` en la carpeta `backend/`:

```env
PORT=5000
MONGODB_URI=mongodb+srv://admin:admin@cluster0.37qcd.mongodb.net/investments-manager?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
```

**Nota**: La URI de MongoDB Atlas ya está configurada. Si prefieres usar MongoDB local, cambia la `MONGODB_URI` a `mongodb://localhost:27017/investments-manager`.

### 3. Configurar Frontend

```bash
cd ../frontend
npm install
```

### 4. Iniciar MongoDB

Asegúrate de que MongoDB esté corriendo:

```bash
# Si tienes MongoDB instalado localmente
mongod
```

O usa MongoDB Atlas (cloud) y actualiza la URI en el archivo `.env`.

## 🚀 Ejecutar la Aplicación

### Desarrollo

**Opción 1 - Scripts automáticos (Recomendado):**

Iniciar todo (backend + frontend en ventanas separadas):
```powershell
.\start-all.ps1
```

O iniciar por separado:
```powershell
# Terminal 1 - Backend
.\start-backend.ps1

# Terminal 2 - Frontend
.\start-frontend.ps1
```

**Opción 2 - Manual:**

**Terminal 1 - Backend:**
```powershell
cd backend
npm run dev
```

El servidor estará disponible en `http://localhost:5000`

**Terminal 2 - Frontend:**
```powershell
cd frontend
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

### Producción

**Backend:**
```bash
cd backend
npm start
```

**Frontend:**
```bash
cd frontend
npm run build
npm run preview
```

## 📁 Estructura del Proyecto

```
Investments-Manager/
├── backend/
│   ├── config/
│   │   └── database.js
│   ├── models/
│   │   ├── Account.js
│   │   ├── Transaction.js
│   │   └── Investment.js
│   ├── routes/
│   │   ├── accountRoutes.js
│   │   ├── transactionRoutes.js
│   │   ├── investmentRoutes.js
│   │   └── dashboardRoutes.js
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── Layout.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Accounts.jsx
│   │   │   ├── Transactions.jsx
│   │   │   └── Investments.jsx
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   └── package.json
└── README.md
```

## 📡 API Endpoints

### Cuentas
- `GET /api/accounts` - Obtener todas las cuentas
- `GET /api/accounts/:id` - Obtener cuenta por ID
- `POST /api/accounts` - Crear nueva cuenta
- `PUT /api/accounts/:id` - Actualizar cuenta
- `DELETE /api/accounts/:id` - Eliminar cuenta

### Transacciones
- `GET /api/transactions` - Obtener todas las transacciones
- `GET /api/transactions/:id` - Obtener transacción por ID
- `POST /api/transactions` - Crear nueva transacción
- `PUT /api/transactions/:id` - Actualizar transacción
- `DELETE /api/transactions/:id` - Eliminar transacción

### Inversiones
- `GET /api/investments` - Obtener todas las inversiones
- `GET /api/investments/:id` - Obtener inversión por ID
- `POST /api/investments` - Crear nueva inversión
- `PUT /api/investments/:id` - Actualizar inversión
- `DELETE /api/investments/:id` - Eliminar inversión

### Dashboard
- `GET /api/dashboard/stats` - Estadísticas generales
- `GET /api/dashboard/balance-chart` - Datos para gráfica de balance
- `GET /api/dashboard/investments-by-type` - Distribución de inversiones

## 🎨 Características del Dashboard

- **Vista General**: Resumen de balance total, inversiones y ganancias/pérdidas
- **Gráficas Interactivas**: 
  - Balance mensual (líneas)
  - Distribución de inversiones (torta)
- **Gestión Completa**: CRUD para cuentas, transacciones e inversiones
- **Cálculos Automáticos**: Balance de cuentas y ganancias/pérdidas de inversiones

## 🔐 Seguridad

⚠️ **Importante**: En producción, asegúrate de:
- Cambiar `JWT_SECRET` por un valor seguro
- Implementar autenticación de usuarios
- Validar y sanitizar todas las entradas
- Usar HTTPS
- Configurar CORS apropiadamente

## 📝 Próximas Mejoras

- [ ] Autenticación de usuarios
- [ ] Exportación de datos (CSV, PDF)
- [ ] Notificaciones y alertas
- [ ] Integración con APIs de precios en tiempo real
- [ ] Categorías personalizadas
- [ ] Presupuestos y objetivos
- [ ] Múltiples monedas con conversión automática

## 📄 Licencia

ISC

## 👤 Autor

Creado con ❤️ para gestionar inversiones de manera eficiente
