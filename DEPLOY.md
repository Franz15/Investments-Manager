# Despliegue

Arquitectura en producción: **frontend en Vercel + backend en Railway + MongoDB Atlas**.

## Backend (Railway)

- Proyecto conectado al repo de GitHub, **Root Directory:** `backend`, **Start Command:** `npm start`.
- Variables de entorno:

```env
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/investments-manager?retryWrites=true&w=majority
JWT_SECRET=<openssl rand -base64 32>
NODE_ENV=production
FRONTEND_URL=https://<tu-frontend>.vercel.app

# Enable Banking (ver ENABLE_BANKING.md §7)
EB_APP_ID=...
EB_PRIVATE_KEY_BASE64=...
EB_REDIRECT_URL=https://<tu-frontend>.vercel.app/bank-callback
EB_ENC_KEY=<openssl rand -hex 32>
```

- URL pública: Settings → Domains → Generate Domain.
- Verificación: `https://<backend>.railway.app/api/health` → `{"status":"OK", ...}`.

## Frontend (Vercel)

- **Framework:** Vite · **Root Directory:** `frontend` · **Build:** `npm run build` · **Output:** `dist`.
- Variable de entorno: `VITE_API_URL=https://<backend>.railway.app/api`.

## MongoDB Atlas

- Cluster M0 (free), usuario con read/write, Network Access `0.0.0.0/0`.
- La connection string es el `MONGODB_URI` de Railway.

## Problemas frecuentes

- **CORS**: `FRONTEND_URL` debe coincidir exactamente con el dominio de Vercel (admite lista separada por comas).
- **Mongo no conecta**: revisa password en la URI y Network Access en Atlas.
- **Build de Railway falla**: confirma Root Directory `backend` guardado antes del primer build; builder Nixpacks.
