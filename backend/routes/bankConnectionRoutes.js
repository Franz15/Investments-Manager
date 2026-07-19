import crypto from 'crypto';
import express from 'express';
import BankConnection from '../models/BankConnection.js';
import SubAccount from '../models/SubAccount.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import {
  createSession,
  deleteSession,
  decryptSecret,
  encryptSecret,
  getAspsps,
  psuHeadersFromRequest,
  startAuth,
} from '../services/enableBankingService.js';
import { maskIban, syncConnection } from '../services/bankSyncService.js';

const router = express.Router();
router.use(authenticateToken);

const PENDING_TTL_MS = 15 * 60 * 1000;
const DEFAULT_CONSENT_DAYS = 180; // máximo habitual PSD2; el banco puede recortarlo

// GET /api/bank-connections/aspsps?country=ES — bancos disponibles
router.get('/aspsps', async (req, res) => {
  try {
    const data = await getAspsps(req.query.country || 'ES');
    res.json(
      (data.aspsps || []).map((a) => ({
        name: a.name,
        country: a.country,
        logo: a.logo,
        maximumConsentValidity: a.maximum_consent_validity,
      }))
    );
  } catch (error) {
    console.error('Error listando ASPSPs:', error.message);
    res.status(502).json({ message: 'Error consultando bancos disponibles' });
  }
});

// POST /api/bank-connections/start { aspspName, country } → { url }
router.post('/start', async (req, res) => {
  try {
    const { aspspName, country = 'ES' } = req.body;
    if (!aspspName) return res.status(400).json({ message: 'aspspName es requerido' });

    // ponytail: limpieza perezosa de pendientes viejos en cada start; TTL index si crece
    await BankConnection.deleteMany({
      user: req.userId,
      status: 'pending',
      createdAt: { $lt: new Date(Date.now() - PENDING_TTL_MS) },
    });

    const state = crypto.randomBytes(24).toString('hex');
    const validUntil = new Date(Date.now() + DEFAULT_CONSENT_DAYS * 24 * 3600 * 1000);

    const { url } = await startAuth({
      aspspName,
      country,
      validUntil: validUntil.toISOString(),
      state,
      psuHeaders: psuHeadersFromRequest(req),
    });

    await BankConnection.create({
      user: req.userId,
      aspsp: { name: aspspName, country },
      state,
      status: 'pending',
    });

    res.json({ url });
  } catch (error) {
    console.error('Error iniciando conexión bancaria:', error.message);
    res.status(502).json({ message: 'Error iniciando la autorización con el banco' });
  }
});

// POST /api/bank-connections/complete { code, state } — callback del banco
router.post('/complete', async (req, res) => {
  try {
    const { code, state } = req.body;
    if (!code || !state) return res.status(400).json({ message: 'code y state son requeridos' });

    // Validación anti-CSRF: el state debe existir, ser de este usuario y reciente
    const connection = await BankConnection.findOne({
      user: req.userId,
      state,
      status: 'pending',
      createdAt: { $gt: new Date(Date.now() - PENDING_TTL_MS) },
    }).select('+state +sessionIdEncrypted');

    if (!connection) {
      return res
        .status(400)
        .json({ message: 'Autorización no válida o expirada. Vuelve a intentarlo.' });
    }

    const session = await createSession(code, psuHeadersFromRequest(req));

    connection.sessionIdEncrypted = encryptSecret(session.session_id);
    connection.state = undefined;
    connection.status = 'active';
    connection.validUntil = session.access?.valid_until
      ? new Date(session.access.valid_until)
      : connection.validUntil;
    connection.accounts = (session.accounts || []).map((a) => ({
      uid: a.uid,
      identificationHash: a.identification_hash,
      ibanMasked: maskIban(a.account_id?.iban),
      name: a.name || a.product || a.account_id?.iban?.slice(-4) || 'Cuenta',
      currency: a.currency,
    }));
    await connection.save();

    res.json(sanitize(connection));
  } catch (error) {
    console.error('Error completando conexión bancaria:', error.message);
    res.status(502).json({ message: 'Error completando la autorización con el banco' });
  }
});

// GET /api/bank-connections — conexiones del usuario (sin pendientes)
router.get('/', async (req, res) => {
  const connections = await BankConnection.find({ user: req.userId, status: { $ne: 'pending' } });
  res.json(connections.map(sanitize));
});

// PUT /api/bank-connections/:id/accounts { mappings: [{ uid, subAccount }] }
router.put('/:id/accounts', async (req, res) => {
  const connection = await BankConnection.findOne({ _id: req.params.id, user: req.userId });
  if (!connection) return res.status(404).json({ message: 'Conexión no encontrada' });

  const mappings = req.body.mappings || [];
  // Solo subcuentas del propio usuario: el sync escribe balance en la subcuenta mapeada
  const requestedIds = mappings.map((m) => m.subAccount).filter(Boolean);
  const owned = await SubAccount.find({ _id: { $in: requestedIds }, user: req.userId }).select(
    '_id'
  );
  const ownedIds = new Set(owned.map((s) => s._id.toString()));

  for (const m of mappings) {
    const ebAccount = connection.accounts.find((a) => a.uid === m.uid);
    if (ebAccount) {
      ebAccount.subAccount = m.subAccount && ownedIds.has(m.subAccount) ? m.subAccount : null;
      ebAccount.account = null;
    }
  }
  await connection.save();
  res.json(sanitize(connection));
});

// POST /api/bank-connections/:id/sync { full } — sync manual (usuario presente)
router.post('/:id/sync', async (req, res) => {
  try {
    const connection = await BankConnection.findOne({
      _id: req.params.id,
      user: req.userId,
      status: 'active',
    }).select('+sessionIdEncrypted');
    if (!connection) return res.status(404).json({ message: 'Conexión activa no encontrada' });

    const created = await syncConnection(connection, {
      full: !!req.body.full,
      psuHeaders: psuHeadersFromRequest(req),
    });
    res.json({ created });
  } catch (error) {
    console.error('Error sincronizando:', error.message);
    const expired = error.status === 401 || error.status === 403;
    // Persistir el error para poder diagnosticar sin acceso a los logs del servidor
    await BankConnection.updateOne(
      { _id: req.params.id, user: req.userId },
      { lastSyncError: error.message?.slice(0, 500), ...(expired ? { status: 'expired' } : {}) }
    ).catch(() => {});
    res.status(502).json({
      message: expired
        ? 'El consentimiento ha expirado. Reconecta el banco.'
        : 'Error sincronizando con el banco',
    });
  }
});

// DELETE /api/bank-connections/:id — revoca consentimiento y borra la conexión
router.delete('/:id', async (req, res) => {
  const connection = await BankConnection.findOne({ _id: req.params.id, user: req.userId }).select(
    '+sessionIdEncrypted'
  );
  if (!connection) return res.status(404).json({ message: 'Conexión no encontrada' });

  if (connection.sessionIdEncrypted && connection.status === 'active') {
    try {
      await deleteSession(decryptSecret(connection.sessionIdEncrypted));
    } catch (error) {
      // Best effort: si el banco ya la revocó, seguimos borrando localmente
      console.error('Error revocando sesión en EB:', error.message);
    }
  }
  await connection.deleteOne();
  res.json({ message: 'Conexión eliminada' });
});

function sanitize(connection) {
  const obj = connection.toObject();
  delete obj.sessionIdEncrypted;
  delete obj.state;
  return obj;
}

export default router;
