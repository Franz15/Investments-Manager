import express from "express";
import Transaction from "../models/Transaction.js";
import SubAccount from "../models/SubAccount.js";
import Account from "../models/Account.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Aplicar middleware de autenticaci?n a todas las rutas
router.use(authenticateToken);

// GET todas las transacciones
router.get("/", async (req, res) => {
  try {
    const { subAccountId, accountId, startDate, endDate } = req.query;
    const query = { user: req.userId };

    if (subAccountId) {
      query.subAccount = subAccountId;
    } else if (accountId) {
      // Si se busca por accountId, buscar transacciones directas de la cuenta o de sus subcuentas
      const subAccounts = await SubAccount.find({
        account: accountId,
        user: req.userId,
      });
      query.$or = [
        { account: accountId },
        { subAccount: { $in: subAccounts.map((sa) => sa._id) } },
      ];
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .populate({
        path: "account",
        select: "name bankName currency",
        match: { user: req.userId },
      })
      .populate({
        path: "subAccount",
        select: "name type balance currency",
        match: { user: req.userId },
        populate: {
          path: "account",
          select: "name bankName",
          match: { user: req.userId },
        },
      })
      .sort({ date: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET transacci?n por ID
router.get("/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.userId,
    })
      .populate({
        path: "account",
        match: { user: req.userId },
      })
      .populate({
        path: "subAccount",
        match: { user: req.userId },
        populate: {
          path: "account",
          match: { user: req.userId },
        },
      });
    if (!transaction) {
      return res.status(404).json({ message: "Transacci?n no encontrada" });
    }
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST crear nueva transacci?n
router.post("/", async (req, res) => {
  try {
    let targetSubAccount = null;

    // Si se proporciona subAccount, usarla directamente
    if (req.body.subAccount) {
      targetSubAccount = await SubAccount.findOne({
        _id: req.body.subAccount,
        user: req.userId,
      });
      if (!targetSubAccount) {
        return res.status(404).json({ message: "Subcuenta no encontrada" });
      }
    }
    // Si se proporciona account pero no subAccount, buscar o crear una subcuenta de tipo cash
    else if (req.body.account) {
      const account = await Account.findOne({
        _id: req.body.account,
        user: req.userId,
      });
      if (!account) {
        return res.status(404).json({ message: "Cuenta no encontrada" });
      }

      // Buscar una subcuenta de tipo cash en esta cuenta
      targetSubAccount = await SubAccount.findOne({
        account: req.body.account,
        user: req.userId,
        type: "cash",
      });

      // Si no existe, crear una autom?ticamente
      if (!targetSubAccount) {
        targetSubAccount = new SubAccount({
          user: req.userId,
          account: req.body.account,
          name: "Cuenta Principal",
          type: "cash",
          balance: 0,
          currency: account.currency,
          description: "Subcuenta creada autom?ticamente para transacciones",
        });
        await targetSubAccount.save();
      }
    } else {
      return res.status(400).json({
        message: "Debe especificar una cuenta o subcuenta",
      });
    }

    // Crear la transacci?n con la subcuenta encontrada/creada
    const transaction = new Transaction({
      ...req.body,
      user: req.userId,
      account: req.body.account || targetSubAccount.account,
      subAccount: targetSubAccount._id,
    });
    const savedTransaction = await transaction.save();

    // Actualizar balance de la subcuenta
    if (req.body.type === "income") {
      targetSubAccount.balance += req.body.amount;
    } else if (req.body.type === "expense") {
      targetSubAccount.balance -= req.body.amount;
      // Validar que el balance no sea negativo
      if (targetSubAccount.balance < 0) {
        // Revertir el cambio
        targetSubAccount.balance += req.body.amount;
        await targetSubAccount.save();
        // Eliminar la transacci?n creada
        await Transaction.findByIdAndDelete(savedTransaction._id);
        return res.status(400).json({
          message: "El balance de la subcuenta no puede ser negativo",
        });
      }
    }
    // Para transferencias, no actualizamos el balance aqu? (se maneja en el frontend con dos transacciones)
    await targetSubAccount.save();

    const populatedTransaction = await Transaction.findById(
      savedTransaction._id,
    )
      .populate({
        path: "account",
      })
      .populate({
        path: "subAccount",
        populate: {
          path: "account",
        },
      });
    res.status(201).json(populatedTransaction);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT actualizar transacci?n
router.put("/:id", async (req, res) => {
  try {
    // Obtener la transacci?n original antes de actualizarla
    const oldTransaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.userId,
    });
    if (!oldTransaction) {
      return res.status(404).json({ message: "Transacci?n no encontrada" });
    }

    // Valores nuevos (o los antiguos si no se proporcionaron)
    const newType = req.body.type || oldTransaction.type;
    const newAmount =
      req.body.amount !== undefined ? req.body.amount : oldTransaction.amount;
    const newAccountId = req.body.account || oldTransaction.account;
    const newSubAccountId = req.body.subAccount || oldTransaction.subAccount;

    // Revertir el balance de la subcuenta original
    const oldSubAccount = await SubAccount.findOne({
      _id: oldTransaction.subAccount,
      user: req.userId,
    });
    if (oldSubAccount) {
      if (oldTransaction.type === "income") {
        oldSubAccount.balance -= oldTransaction.amount;
      } else if (oldTransaction.type === "expense") {
        oldSubAccount.balance += oldTransaction.amount;
      }
      await oldSubAccount.save();
    }

    // Obtener la nueva subcuenta
    let newSubAccount = null;
    if (newSubAccountId) {
      newSubAccount = await SubAccount.findOne({
        _id: newSubAccountId,
        user: req.userId,
      });
    } else if (newAccountId) {
      // Si se proporciona account pero no subAccount, buscar o crear una subcuenta de tipo cash
      const account = await Account.findOne({
        _id: newAccountId,
        user: req.userId,
      });
      if (!account) {
        // Revertir el cambio en la subcuenta original
        if (oldSubAccount) {
          if (oldTransaction.type === "income") {
            oldSubAccount.balance += oldTransaction.amount;
          } else if (oldTransaction.type === "expense") {
            oldSubAccount.balance -= oldTransaction.amount;
          }
          await oldSubAccount.save();
        }
        return res.status(404).json({ message: "Cuenta no encontrada" });
      }

      // Buscar una subcuenta de tipo cash en esta cuenta
      newSubAccount = await SubAccount.findOne({
        account: newAccountId,
        user: req.userId,
        type: "cash",
      });

      // Si no existe, crear una autom?ticamente
      if (!newSubAccount) {
        newSubAccount = new SubAccount({
          user: req.userId,
          account: newAccountId,
          name: "Cuenta Principal",
          type: "cash",
          balance: 0,
          currency: account.currency,
          description: "Subcuenta creada autom?ticamente para transacciones",
        });
        await newSubAccount.save();
      }
    }

    if (!newSubAccount) {
      // Revertir el cambio en la subcuenta original si la nueva no existe
      if (oldSubAccount) {
        if (oldTransaction.type === "income") {
          oldSubAccount.balance += oldTransaction.amount;
        } else if (oldTransaction.type === "expense") {
          oldSubAccount.balance -= oldTransaction.amount;
        }
        await oldSubAccount.save();
      }
      return res.status(404).json({ message: "Subcuenta no encontrada" });
    }

    // Aplicar el nuevo balance
    if (newType === "income") {
      newSubAccount.balance += newAmount;
    } else if (newType === "expense") {
      newSubAccount.balance -= newAmount;
      // Validar que el balance no sea negativo (solo para expenses)
      if (newSubAccount.balance < 0) {
        // Revertir el cambio
        newSubAccount.balance += newAmount;
        await newSubAccount.save();
        // Revertir tambi?n el cambio en la subcuenta original
        if (oldSubAccount) {
          if (oldTransaction.type === "income") {
            oldSubAccount.balance += oldTransaction.amount;
          } else if (oldTransaction.type === "expense") {
            oldSubAccount.balance -= oldTransaction.amount;
          }
          await oldSubAccount.save();
        }
        return res.status(400).json({
          message: "El balance de la subcuenta no puede ser negativo",
        });
      }
    }
    // Para transferencias, no actualizamos el balance aqu? (se maneja en el frontend con dos transacciones)

    await newSubAccount.save();

    // Actualizar la transacci?n
    const updateData = {
      ...req.body,
      account: newAccountId || oldTransaction.account,
      subAccount: newSubAccount._id,
    };
    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      updateData,
      {
        new: true,
        runValidators: true,
      },
    )
      .populate({
        path: "account",
        match: { user: req.userId },
      })
      .populate({
        path: "subAccount",
        match: { user: req.userId },
        populate: {
          path: "account",
          match: { user: req.userId },
        },
      });
    if (!transaction) {
      return res.status(404).json({ message: "Transacci?n no encontrada" });
    }

    res.json(transaction);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE eliminar transacci?n
router.delete("/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.userId,
    });
    if (!transaction) {
      return res.status(404).json({ message: "Transacci?n no encontrada" });
    }

    // Revertir balance de la subcuenta (verificar que pertenece al usuario)
    if (transaction.subAccount) {
      const subAccount = await SubAccount.findOne({
        _id: transaction.subAccount,
        user: req.userId,
      });
      if (subAccount) {
        if (transaction.type === "income") {
          subAccount.balance -= transaction.amount;
        } else if (transaction.type === "expense") {
          subAccount.balance += transaction.amount;
        }
        await subAccount.save();
      }
    }

    await Transaction.findByIdAndDelete(req.params.id);
    res.json({ message: "Transacci?n eliminada" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
