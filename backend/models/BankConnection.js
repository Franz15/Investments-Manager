import mongoose from 'mongoose';

const bankConnectionSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      index: true,
    },
    aspsp: {
      name: { type: String, required: true },
      country: { type: String, required: true, default: 'ES' },
    },
    // session_id de Enable Banking cifrado con AES-256-GCM (ver enableBankingService)
    sessionIdEncrypted: {
      type: String,
      select: false,
    },
    // state aleatorio del flujo OAuth-like, solo en estado 'pending' (anti-CSRF)
    state: {
      type: String,
      index: true,
      select: false,
    },
    validUntil: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'expired', 'revoked', 'error'],
      default: 'pending',
    },
    accounts: [
      {
        uid: String, // uid de cuenta EB (cambia por sesión)
        identificationHash: String, // estable entre sesiones → re-mapeo al renovar
        ibanMasked: String, // nunca el IBAN completo
        name: String,
        currency: String,
        account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
        subAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'SubAccount', default: null },
        lastSyncedAt: { type: Date, default: null },
      },
    ],
    lastSyncError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('BankConnection', bankConnectionSchema);
