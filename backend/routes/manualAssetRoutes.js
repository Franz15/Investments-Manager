import express from 'express';
import ManualAsset from '../models/ManualAsset.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const assets = await ManualAsset.find({ user: req.userId })
      .populate('linkedDebt', 'name remainingAmount')
      .sort({ type: 1, name: 1 });
    res.json(assets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      type,
      currentValue,
      purchasePrice,
      purchaseDate,
      currency,
      description,
      linkedDebt,
    } = req.body;
    const asset = await ManualAsset.create({
      user: req.userId,
      name,
      type,
      currentValue,
      currency,
      description,
      purchasePrice: purchasePrice || null,
      purchaseDate: purchaseDate || null,
      linkedDebt: linkedDebt || null,
      lastValuationDate: new Date(),
    });
    const populated = await asset.populate('linkedDebt', 'name remainingAmount');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const asset = await ManualAsset.findOne({ _id: req.params.id, user: req.userId });
    if (!asset) return res.status(404).json({ error: 'No encontrado' });

    const allowed = [
      'name',
      'type',
      'currentValue',
      'purchasePrice',
      'purchaseDate',
      'currency',
      'description',
      'linkedDebt',
    ];
    allowed.forEach((f) => {
      if (req.body[f] !== undefined) asset[f] = req.body[f];
    });
    if (req.body.currentValue !== undefined) asset.lastValuationDate = new Date();

    await asset.save();
    const populated = await asset.populate('linkedDebt', 'name remainingAmount');
    res.json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const asset = await ManualAsset.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!asset) return res.status(404).json({ error: 'No encontrado' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
