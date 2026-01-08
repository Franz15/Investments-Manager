# 🚀 Guía de Despliegue - Investments Manager

Esta guía te ayudará a publicar tu aplicación en producción.

## 📋 Opciones de Despliegue

### Opción 1: Vercel (Frontend) + Railway (Backend) ⭐ RECOMENDADO

#### **Paso 1: Desplegar Backend en Railway**

1. **Crear cuenta en Railway:**
   - Ve a [railway.app](https://railway.app)
   - Regístrate con GitHub

2. **Crear nuevo proyecto:**
   - Click en "New Project"
   - Selecciona "Deploy from GitHub repo"
   - Conecta tu repositorio
   - Selecciona la carpeta `backend`

3. **Configurar variables de entorno:**
   - En Railway, ve a "Variables"
   - Agrega estas variables:
     ```
     PORT=5000
     MONGODB_URI=tu-uri-de-mongodb-atlas
     JWT_SECRET=tu-secret-key-super-segura
     NODE_ENV=production
     ```

4. **Configurar el build:**
   - Railway detectará automáticamente Node.js
   - Asegúrate de que el "Start Command" sea: `npm start`
   - El "Root Directory" debe ser: `backend`

5. **Obtener la URL del backend:**
   - Railway te dará una URL como: `https://tu-app.railway.app`
   - Copia esta URL

#### **Paso 2: Desplegar Frontend en Vercel**

1. **Crear cuenta en Vercel:**
   - Ve a [vercel.com](https://vercel.com)
   - Regístrate con GitHub

2. **Crear nuevo proyecto:**
   - Click en "Add New Project"
   - Importa tu repositorio de GitHub
   - Configura:
     - **Framework Preset:** Vite
     - **Root Directory:** `frontend`
     - **Build Command:** `npm run build`
     - **Output Directory:** `dist`

3. **Configurar variables de entorno:**
   - En Vercel, ve a "Settings" > "Environment Variables"
   - Agrega:
     ```
     VITE_API_URL=https://tu-app.railway.app/api
     ```

4. **Actualizar el código del frontend:**
   - Necesitas modificar `frontend/src/services/api.js` para usar la variable de entorno

#### **Paso 3: Actualizar configuración del Frontend**

Modifica `frontend/src/services/api.js`:

```javascript
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// ... resto del código igual
```

Y actualiza `frontend/vite.config.js`:

```javascript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: import.meta.env.VITE_API_URL || "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
```

---

### Opción 2: Render (Todo en un solo lugar)

#### **Backend en Render:**

1. Ve a [render.com](https://render.com) y regístrate
2. Click en "New +" > "Web Service"
3. Conecta tu repositorio de GitHub
4. Configura:
   - **Name:** `investments-manager-backend`
   - **Environment:** Node
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && npm start`
   - **Root Directory:** `backend`

5. Variables de entorno:
   ```
   PORT=5000
   MONGODB_URI=tu-uri-mongodb
   JWT_SECRET=tu-secret-key
   NODE_ENV=production
   ```

#### **Frontend en Render:**

1. Click en "New +" > "Static Site"
2. Conecta tu repositorio
3. Configura:
   - **Name:** `investments-manager-frontend`
   - **Build Command:** `cd frontend && npm install && npm run build`
   - **Publish Directory:** `frontend/dist`

4. Variables de entorno:
   ```
   VITE_API_URL=https://tu-backend.onrender.com/api
   ```

---

### Opción 3: VPS (DigitalOcean, AWS, etc.)

Si prefieres un servidor propio:

#### **Configuración del servidor:**

1. **Conectarte al servidor:**

   ```bash
   ssh root@tu-servidor-ip
   ```

2. **Instalar Node.js:**

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Instalar Nginx:**

   ```bash
   sudo apt update
   sudo apt install nginx
   ```

4. **Clonar tu repositorio:**

   ```bash
   git clone tu-repositorio
   cd Investments-Manager
   ```

5. **Configurar Backend:**

   ```bash
   cd backend
   npm install
   # Crear archivo .env con tus variables
   ```

6. **Instalar PM2 (gestor de procesos):**

   ```bash
   sudo npm install -g pm2
   pm2 start server.js --name backend
   pm2 save
   pm2 startup
   ```

7. **Configurar Nginx para Backend:**

   ```bash
   sudo nano /etc/nginx/sites-available/backend
   ```

   Contenido:

   ```nginx
   server {
       listen 80;
       server_name api.tu-dominio.com;

       location / {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

8. **Configurar Frontend:**

   ```bash
   cd ../frontend
   npm install
   npm run build
   ```

9. **Configurar Nginx para Frontend:**

   ```bash
   sudo nano /etc/nginx/sites-available/frontend
   ```

   Contenido:

   ```nginx
   server {
       listen 80;
       server_name tu-dominio.com;

       root /ruta/a/Investments-Manager/frontend/dist;
       index index.html;

       location / {
           try_files $uri $uri/ /index.html;
       }

       location /api {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

10. **Habilitar sitios:**

    ```bash
    sudo ln -s /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/
    sudo ln -s /etc/nginx/sites-available/frontend /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl reload nginx
    ```

11. **Configurar SSL con Let's Encrypt:**
    ```bash
    sudo apt install certbot python3-certbot-nginx
    sudo certbot --nginx -d tu-dominio.com -d api.tu-dominio.com
    ```

---

## 🔧 Configuración Necesaria

### 1. MongoDB Atlas (Base de datos en la nube)

1. Ve a [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Crea una cuenta gratuita
3. Crea un cluster (gratis)
4. Crea un usuario de base de datos
5. En "Network Access", agrega `0.0.0.0/0` para permitir conexiones desde cualquier IP
6. Copia la connection string y úsala como `MONGODB_URI`

### 2. Variables de Entorno

**Backend (.env):**

```env
PORT=5000
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/investments-manager?retryWrites=true&w=majority
JWT_SECRET=genera-un-secret-key-muy-seguro-aqui
NODE_ENV=production
```

**Frontend (.env):**

```env
VITE_API_URL=https://tu-backend-url.com/api
```

### 3. CORS en Backend

Asegúrate de que `backend/server.js` tenga configurado CORS para permitir tu dominio:

```javascript
const cors = require("cors");

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "https://tu-frontend.vercel.app",
    credentials: true,
  }),
);
```

---

## 📝 Checklist Pre-Despliegue

- [ ] Cambiar `JWT_SECRET` por un valor seguro (usa un generador de secrets)
- [ ] Configurar MongoDB Atlas o base de datos en producción
- [ ] Actualizar URLs en el frontend para apuntar al backend de producción
- [ ] Configurar CORS en el backend
- [ ] Probar que todas las rutas funcionen
- [ ] Verificar que las variables de entorno estén configuradas
- [ ] Hacer build del frontend y verificar que no haya errores
- [ ] Configurar dominio personalizado (opcional)

---

## 🆘 Solución de Problemas

### Error: "Cannot connect to MongoDB"

- Verifica que la URI de MongoDB sea correcta
- Asegúrate de que la IP esté permitida en MongoDB Atlas

### Error: "CORS policy"

- Verifica la configuración de CORS en el backend
- Asegúrate de que el origen del frontend esté permitido

### Error: "404 Not Found" en rutas del frontend

- Si usas React Router, asegúrate de configurar el servidor para servir `index.html` en todas las rutas

### El frontend no puede conectar con el backend

- Verifica que `VITE_API_URL` esté configurada correctamente
- Verifica que el backend esté corriendo y accesible

---

## 💡 Recomendaciones

1. **Usa HTTPS:** Siempre en producción
2. **Monitorea errores:** Considera usar Sentry o similar
3. **Backups:** Configura backups automáticos de MongoDB
4. **Logs:** Configura logging adecuado en producción
5. **Rate Limiting:** Considera agregar rate limiting al backend

---

## 📚 Recursos Adicionales

- [Vercel Docs](https://vercel.com/docs)
- [Railway Docs](https://docs.railway.app)
- [Render Docs](https://render.com/docs)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
