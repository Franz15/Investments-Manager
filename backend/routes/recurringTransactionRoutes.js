import express from 'express';
import RecurringTransaction from '../models/RecurringTransaction.js';
import Transaction from '../models/Transaction.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { processRecurringTransactions } from '../scheduler/recurringScheduler.js';

const router = express.Router();

// Avanzar nextDate según frecuencia
function advanceDate(date, frequency) {
  const d = new Date(date);
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'biweekly':
      d.setDate(d.getDate() + 14);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'bimonthly':
      d.setMonth(d.getMonth() + 2);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
}

// GET /api/recurring-transactions
router.get('/', authenticateToken, async (req, res) => {
  try {
    const items = await RecurringTransaction.find({ user: req.userId })
      .populate({ path: 'subAccount', populate: { path: 'account', select: 'name' } })
      .sort({ nextDate: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recurring-transactions/process — procesar todas las pendientes ahora
// (debe ir ANTES de /:id para que no sea capturado como id)
router.post('/process', authenticateToken, async (req, res) => {
  try {
    const count = await processRecurringTransactions();
    res.json({ created: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recurring-transactions
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      type,
      category,
      subAccount,
      amount,
      currency,
      description,
      frequency,
      startDate,
      endDate,
      business,
      tags,
    } = req.body;

    const nextDate = new Date(startDate);

    const rt = await RecurringTransaction.create({
      user: req.userId,
      name,
      type,
      category,
      subAccount,
      amount,
      currency,
      description,
      frequency,
      startDate,
      endDate: endDate || null,
      nextDate,
      business: business || null,
      tags: tags || [],
    });

    const populated = await rt.populate([
      { path: 'subAccount', populate: { path: 'account', select: 'name' } },
    ]);
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/recurring-transactions/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const rt = await RecurringTransaction.findOne({ _id: req.params.id, user: req.userId });
    if (!rt) return res.status(404).json({ error: 'No encontrado' });

    const allowed = [
      'name',
      'type',
      'category',
      'subAccount',
      'amount',
      'currency',
      'description',
      'frequency',
      'startDate',
      'endDate',
      'isActive',
      'business',
      'tags',
      'nextDate',
    ];
    allowed.forEach((f) => {
      if (req.body[f] !== undefined) rt[f] = req.body[f];
    });

    await rt.save();
    const populated = await rt.populate([
      { path: 'subAccount', populate: { path: 'account', select: 'name' } },
    ]);
    res.json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/recurring-transactions/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const rt = await RecurringTransaction.findOneAndDelete({
      _id: req.params.id,
      user: req.userId,
    });
    if (!rt) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recurring-transactions/:id/trigger — genera la transacción ahora
router.post('/:id/trigger', authenticateToken, async (req, res) => {
  try {
    const rt = await RecurringTransaction.findOne({ _id: req.params.id, user: req.userId });
    if (!rt) return res.status(404).json({ error: 'No encontrado' });

    const tx = await Transaction.create({
      user: rt.user,
      subAccount: rt.subAccount,
      type: rt.type,
      category: rt.category,
      amount: rt.amount,
      currency: rt.currency,
      description: rt.description || rt.name,
      date: new Date(),
      tags: rt.tags || [],
      business: rt.business || null,
    });

    rt.lastGenerated = new Date();
    rt.nextDate = advanceDate(rt.nextDate, rt.frequency);
    if (rt.endDate && rt.nextDate > rt.endDate) rt.isActive = false;
    await rt.save();

    res.json({ transaction: tx, nextDate: rt.nextDate });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
