# 🚂 Guía Paso a Paso: Desplegar en Railway

Esta guía te llevará paso a paso para desplegar tu backend en Railway.

## 📋 Prerrequisitos

- [ ] Cuenta en GitHub (tu código debe estar en un repositorio)
- [ ] Cuenta en MongoDB Atlas (o ya tener una URI de MongoDB)
- [ ] Tu aplicación funcionando localmente

---

## Paso 1: Preparar MongoDB Atlas

1. **Ve a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)**
   - Si no tienes cuenta, créala (es gratis)

2. **Crea un Cluster:**
   - Click en "Build a Database"
   - Selecciona el plan **FREE (M0)**
   - Elige una región cercana a ti
   - Click en "Create"

3. **Crea un usuario de base de datos:**
   - Ve a "Database Access" (menú lateral)
   - Click en "Add New Database User"
   - Elige "Password" como método de autenticación
   - Crea un usuario y contraseña (guárdalos bien)
   - En "Database User Privileges", selecciona "Read and write to any database"
   - Click en "Add User"

4. **Configurar Network Access:**
   - Ve a "Network Access" (menú lateral)
   - Click en "Add IP Address"
   - Click en "Allow Access from Anywhere" (o agrega `0.0.0.0/0`)
   - Click en "Confirm"

5. **Obtener la Connection String:**
   - Ve a "Database" (menú lateral)
   - Click en "Connect" en tu cluster
   - Selecciona "Connect your application"
   - Copia la connection string
   - Reemplaza `<password>` con la contraseña de tu usuario
   - Reemplaza `<dbname>` con `investments-manager` (o el nombre que prefieras)
   - **Ejemplo:** `mongodb+srv://usuario:password@cluster0.xxxxx.mongodb.net/investments-manager?retryWrites=true&w=majority`
   - **Guarda esta URI**, la necesitarás en Railway

---

## Paso 2: Crear cuenta en Railway

1. **Ve a [railway.app](https://railway.app)**

2. **Regístrate:**
   - Click en "Start a New Project"
   - Selecciona "Login with GitHub"
   - Autoriza Railway para acceder a tus repositorios

---

## Paso 3: Desplegar el Backend

### 3.1 Crear el Proyecto

1. **En Railway, click en "New Project"**

2. **Selecciona "Deploy from GitHub repo"**
   - Si no ves tu repositorio, click en "Configure GitHub App" y autoriza

3. **Selecciona tu repositorio:**
   - Busca y selecciona el repositorio donde está tu código

4. **Railway detectará automáticamente Node.js**
   - Si no lo detecta, no te preocupes, lo configuraremos manualmente

### 3.2 Configurar el Servicio

1. **Click en el servicio que Railway creó**

2. **Ve a la pestaña "Settings"**

3. **Configura "Root Directory":**
   - En "Root Directory", escribe: `backend`
   - Esto le dice a Railway dónde está tu código del backend
   - **IMPORTANTE:** Guarda los cambios antes de continuar

4. **Configura el comando de inicio:**
   - En "Start Command", escribe: `npm start`
   - Railway debería detectarlo automáticamente, pero verifica

5. **Si ves el error "Error creating build plan with Railpack":**
   - Asegúrate de que el archivo `nixpacks.toml` esté en la carpeta `backend/`
   - Si no existe, Railway debería detectar Node.js automáticamente
   - Intenta hacer un nuevo deployment después de configurar el Root Directory
   - Si persiste, ve a "Settings" > "Build" y selecciona "Nixpacks" como builder

### 3.3 Configurar Variables de Entorno

1. **Ve a la pestaña "Variables"**

2. **Agrega las siguientes variables:**

   ```
   PORT=5000
   ```

   _(Railway asigna un puerto automáticamente, pero puedes poner 5000)_

   ```
   MONGODB_URI=mongodb+srv://usuario:password@cluster0.xxxxx.mongodb.net/investments-manager?retryWrites=true&w=majority
   ```

   _(Pega aquí la URI que copiaste de MongoDB Atlas)_

   ```
   JWT_SECRET=tu-secret-key-super-segura-aqui
   ```

   _(Genera una clave segura. Puedes usar: `openssl rand -base64 32` o cualquier generador de secrets)_

   ```
   NODE_ENV=production
   ```

3. **Para cada variable:**
   - Click en "New Variable"
   - Escribe el nombre (ej: `MONGODB_URI`)
   - Escribe el valor
   - Click en "Add"

### 3.4 Configurar CORS (Opcional pero recomendado)

Si quieres restringir CORS a tu frontend específico, agrega:

```
FRONTEND_URL=https://tu-frontend.vercel.app
```

_(Lo actualizaremos cuando despliegues el frontend)_

---

## Paso 4: Desplegar

1. **Railway comenzará a desplegar automáticamente**
   - Ve a la pestaña "Deployments" para ver el progreso
   - Puede tardar 2-5 minutos la primera vez

2. **Verifica los logs:**
   - Ve a la pestaña "Deployments"
   - Click en el deployment más reciente
   - Revisa los logs para ver si hay errores
   - Deberías ver: "MongoDB conectado correctamente" y "Servidor corriendo en..."

### 4.1 Si hay errores comunes:

**Error: "Error creating build plan with Railpack"**

- **Solución 1:** Asegúrate de que el "Root Directory" esté configurado como `backend` y guarda los cambios
- **Solución 2:** Ve a "Settings" > "Build" y selecciona "Nixpacks" como builder
- **Solución 3:** Verifica que el archivo `nixpacks.toml` esté en la carpeta `backend/` (ya lo creamos)
- **Solución 4:** Elimina el servicio y créalo de nuevo, asegurándote de configurar el Root Directory ANTES del primer build
- **Solución 5:** En "Settings" > "Build", cambia el "Build Command" a: `cd backend && npm install`

**Error: "Cannot find module"**

- Verifica que el "Root Directory" esté en `backend`
- Verifica que `package.json` esté en la carpeta `backend`
- Verifica que todas las dependencias estén en `package.json`

**Error: "MongoDB connection failed"**

- Verifica que la URI de MongoDB sea correcta
- Verifica que el usuario y contraseña sean correctos
- Verifica que la IP esté permitida en MongoDB Atlas

**Error: "Port already in use"**

- Railway asigna el puerto automáticamente, no necesitas configurarlo
- Puedes eliminar la variable `PORT` o dejarla (Railway la ignorará)

---

## Paso 5: Obtener la URL del Backend

1. **Ve a la pestaña "Settings"**

2. **Busca "Domains" o "Generate Domain"**
   - Railway te dará una URL como: `tu-app-production.up.railway.app`
   - O puedes generar un dominio personalizado

3. **Copia esta URL**
   - Esta será tu URL del backend
   - Ejemplo: `https://investments-manager-backend-production.up.railway.app`

4. **Prueba que funciona:**
   - Abre en el navegador: `https://tu-url.railway.app/api/health`
   - Deberías ver: `{"status":"OK","message":"Server is running"}`

---

## Paso 6: Actualizar CORS (Opcional)

Si quieres restringir CORS solo a tu frontend:

1. **Actualiza la variable de entorno `FRONTEND_URL`** con la URL de tu frontend
2. **Mejora el código de CORS** (ver siguiente sección)

---

## 🔧 Mejora de CORS para Producción

Para hacer tu app más segura, actualiza `backend/server.js`:

```javascript
// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || true, // En producción, usa tu URL del frontend
    credentials: true,
    exposedHeaders: ["x-user-id"],
    allowedHeaders: ["Content-Type", "Authorization", "x-user-id"],
  }),
);
```

Esto permitirá CORS solo desde tu frontend en producción, pero seguirá funcionando en desarrollo.

---

## ✅ Verificación Final

1. **Prueba el endpoint de health:**

   ```
   https://tu-url.railway.app/api/health
   ```

2. **Prueba un endpoint que requiera autenticación:**
   - Debería devolver 401 si no hay token (esto es correcto)

3. **Revisa los logs:**
   - No deberían haber errores
   - Deberías ver "MongoDB conectado correctamente"

---

## 🎯 Siguiente Paso: Desplegar Frontend

Una vez que el backend esté funcionando:

1. **Copia la URL de tu backend de Railway**
2. **Sigue la guía para desplegar el frontend en Vercel**
3. **Configura `VITE_API_URL` en Vercel con la URL de Railway**

---

## 🆘 Solución de Problemas

### El deployment falla

- Revisa los logs en Railway
- Verifica que todas las variables de entorno estén configuradas
- Verifica que el "Root Directory" sea `backend`

### No puedo conectar a MongoDB

- Verifica la URI de MongoDB (debe tener el password correcto)
- Verifica que la IP esté permitida en MongoDB Atlas (debe ser `0.0.0.0/0`)

### CORS errors

- Verifica que `FRONTEND_URL` esté configurada correctamente
- O deja `origin: true` temporalmente para probar

### El servidor se cae

- Revisa los logs para ver el error
- Verifica que MongoDB esté accesible
- Verifica que todas las dependencias estén en `package.json`

---

## 📊 Monitoreo

Railway te permite:

- Ver logs en tiempo real
- Ver métricas de uso (CPU, RAM, etc.)
- Ver el historial de deployments

Todo esto está disponible en el dashboard de Railway.

---

## 💰 Costos

- **Plan gratuito:** $5 de crédito mensual
- **Para tu app:** Probablemente suficiente para empezar
- **Si superas el límite:** Railway te avisará antes de cobrar

---

¡Listo! Tu backend debería estar funcionando en Railway. 🎉
