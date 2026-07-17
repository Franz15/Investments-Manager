import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const EB_API = 'https://api.enablebanking.com';

// Config leída en tiempo de llamada (dotenv corre después de los imports, ver authMiddleware)
function getConfig() {
  const { EB_APP_ID, EB_PRIVATE_KEY_BASE64, EB_REDIRECT_URL, EB_ENC_KEY } = process.env;
  if (!EB_APP_ID || !EB_PRIVATE_KEY_BASE64 || !EB_REDIRECT_URL || !EB_ENC_KEY) {
    throw new Error(
      'Faltan variables de entorno de Enable Banking (EB_APP_ID, EB_PRIVATE_KEY_BASE64, EB_REDIRECT_URL, EB_ENC_KEY)'
    );
  }
  return {
    appId: EB_APP_ID,
    privateKey: Buffer.from(EB_PRIVATE_KEY_BASE64, 'base64').toString('utf8'),
    redirectUrl: EB_REDIRECT_URL,
    encKey: Buffer.from(EB_ENC_KEY, 'hex'), // 32 bytes (64 hex chars)
  };
}

/* ── JWT de aplicación ──────────────────────────────────────────── */

let cachedToken = null;
let cachedTokenExp = 0;

function getAppJwt() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedTokenExp - 60) return cachedToken;

  const { appId, privateKey } = getConfig();
  cachedTokenExp = now + 3600;
  cachedToken = jwt.sign(
    { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: cachedTokenExp },
    privateKey,
    { algorithm: 'RS256', keyid: appId }
  );
  return cachedToken;
}

/* ── HTTP ───────────────────────────────────────────────────────── */

async function ebFetch(path, { method = 'GET', body, psuHeaders } = {}) {
  const res = await fetch(`${EB_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getAppJwt()}`,
      'Content-Type': 'application/json',
      ...(psuHeaders || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const error = new Error(
      `Enable Banking ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`
    );
    error.status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

// Headers PSU: pasarlos siempre que la petición la origine el usuario (recomendación EB)
export function psuHeadersFromRequest(req) {
  return {
    'Psu-Ip-Address': req.ip,
    'Psu-User-Agent': req.headers['user-agent'] || 'unknown',
  };
}

/* ── Endpoints ──────────────────────────────────────────────────── */

export function getAspsps(country = 'ES') {
  return ebFetch(`/aspsps?country=${encodeURIComponent(country)}`);
}

export function startAuth({ aspspName, country, validUntil, state, psuHeaders }) {
  const { redirectUrl } = getConfig();
  return ebFetch('/auth', {
    method: 'POST',
    psuHeaders,
    body: {
      access: { valid_until: validUntil },
      aspsp: { name: aspspName, country },
      state,
      redirect_url: redirectUrl,
      psu_type: 'personal',
    },
  });
}

export function createSession(code, psuHeaders) {
  return ebFetch('/sessions', { method: 'POST', body: { code }, psuHeaders });
}

export function deleteSession(sessionId) {
  return ebFetch(`/sessions/${sessionId}`, { method: 'DELETE' });
}

export function getTransactions(accountUid, { dateFrom, continuationKey, psuHeaders } = {}) {
  const params = new URLSearchParams();
  if (dateFrom) params.set('date_from', dateFrom);
  if (continuationKey) params.set('continuation_key', continuationKey);
  const qs = params.toString();
  return ebFetch(`/accounts/${accountUid}/transactions${qs ? `?${qs}` : ''}`, { psuHeaders });
}

export function getBalances(accountUid, psuHeaders) {
  return ebFetch(`/accounts/${accountUid}/balances`, { psuHeaders });
}

/* ── Cifrado del session_id en reposo (AES-256-GCM) ─────────────── */
// Defensa en profundidad: un dump de la BD sin EB_ENC_KEY no expone la sesión.

export function encryptSecret(plain) {
  const { encKey } = getConfig();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(stored) {
  const { encKey } = getConfig();
  const [iv, tag, enc] = stored.split(':').map((h) => Buffer.from(h, 'hex'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
