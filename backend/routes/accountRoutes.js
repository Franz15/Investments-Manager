import express from 'express';
import Account from '../models/Account.js';
import SubAccount from '../models/SubAccount.js';
import { getUserFromRequest } from '../middleware/userMiddleware.js';

const router = express.Router();

// Aplicar middleware a todas las rutas
router.use(getUserFromRequest);

// GET todas las cuentas con sus subcuentas
router.get('/', async (req, res) => {
  try {
    const accounts = await Account.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .populate({
        path: 'subAccounts',
        select: 'name type balance currency',
        match: { user: req.userId },
      });
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET cuenta por ID con subcuentas
router.get('/:id', async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, user: req.userId }).populate({
      path: 'subAccounts',
      match: { user: req.userId },
    });
    if (!account) {
      return res.status(404).json({ message: 'Cuenta no encontrada' });
    }
    res.json(account);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST crear nueva cuenta
router.post('/', async (req, res) => {
  try {
    const { initialBalance, ...accountData } = req.body;
    
    // Crear la cuenta principal con userId
    const account = new Account({
      ...accountData,
      user: req.userId,
    });
    const savedAccount = await account.save();
    
    // Si hay balance inicial, crear automáticamente una subcuenta de tipo "cash"
    if (initialBalance && initialBalance > 0) {
      const subAccount = new SubAccount({
        user: req.userId,
        account: savedAccount._id,
        name: 'Cuenta Principal',
        type: 'cash',
        balance: initialBalance,
        currency: savedAccount.currency,
        description: 'Balance inicial de la cuenta',
      });
      await subAccount.save();
    }
    
    // Retornar la cuenta con sus subcuentas
    const populatedAccount = await Account.findById(savedAccount._id).populate({
      path: 'subAccounts',
      match: { user: req.userId },
    });
    
    res.status(201).json(populatedAccount);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT actualizar cuenta
router.put('/:id', async (req, res) => {
  try {
    const account = await Account.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );
    if (!account) {
      return res.status(404).json({ message: 'Cuenta no encontrada' });
    }
    res.json(account);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE eliminar cuenta (eliminación real)
router.delete('/:id', async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, user: req.userId });
    if (!account) {
      return res.status(404).json({ message: 'Cuenta no encontrada' });
    }
    
    // Eliminar todas las subcuentas relacionadas del usuario
    await SubAccount.deleteMany({ account: req.params.id, user: req.userId });
    
    // Eliminar la cuenta
    await Account.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Cuenta y todas sus subcuentas eliminadas' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

