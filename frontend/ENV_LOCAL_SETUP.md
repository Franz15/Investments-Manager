# Configurar Frontend Local para Apuntar a Railway

Para que tu frontend local apunte al backend de Railway en lugar del backend local:

## Opción 1: Crear archivo `.env.local` (Recomendado)

1. **Crea un archivo** `frontend/.env.local` con este contenido:

```env
VITE_API_URL=https://investments-manager-production.up.railway.app
```

2. **Reinicia el servidor de desarrollo**:

```bash
cd frontend
npm run dev
```

3. **Ahora el frontend local apuntará a Railway** ✅

## Opción 2: Usar variable de entorno en la terminal

En PowerShell:

```powershell
$env:VITE_API_URL="https://investments-manager-production.up.railway.app"
cd frontend
npm run dev
```

## Volver al Backend Local

Para volver a usar el backend local:

1. **Elimina o comenta** la línea en `frontend/.env.local`:

   ```env
   # VITE_API_URL=https://investments-manager-production.up.railway.app
   ```

2. O **elimina el archivo** `.env.local`

3. **Reinicia el servidor de desarrollo**

## Nota

- El archivo `.env.local` está en `.gitignore`, así que **no se subirá al repositorio**
- Esto es perfecto para desarrollo y debugging
- En producción (Vercel), se usa la variable de entorno configurada en el dashboard
