import express from "express";
import Transaction from "../models/Transaction.js";
import SubAccount from "../models/SubAccount.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// GET todas las transacciones
router.get("/", async (req, res) => {
  try {
    const { subAccountId, accountId, startDate, endDate } = req.query;
    const query = { user: req.userId };

    if (subAccountId) {
      query.subAccount = subAccountId;
    } else if (accountId) {
      // Si se busca por accountId, buscar todas las subcuentas de esa cuenta del usuario
      const subAccounts = await SubAccount.find({
        account: accountId,
        user: req.userId,
      });
      query.subAccount = { $in: subAccounts.map((sa) => sa._id) };
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
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

// GET transacción por ID
router.get("/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.userId,
    }).populate({
      path: "subAccount",
      match: { user: req.userId },
      populate: {
        path: "account",
        match: { user: req.userId },
      },
    });
    if (!transaction) {
      return res.status(404).json({ message: "Transacción no encontrada" });
    }
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST crear nueva transacción
router.post("/", async (req, res) => {
  try {
    const transaction = new Transaction({
      ...req.body,
      user: req.userId,
    });
    const savedTransaction = await transaction.save();

    // Actualizar balance de la subcuenta (verificar que pertenece al usuario)
    const subAccount = await SubAccount.findOne({
      _id: req.body.subAccount,
      user: req.userId,
    });
    if (subAccount) {
      if (req.body.type === "income") {
        subAccount.balance += req.body.amount;
      } else if (req.body.type === "expense") {
        subAccount.balance -= req.body.amount;
      }
      await subAccount.save();
    }

    const populatedTransaction = await Transaction.findById(
      savedTransaction._id,
    ).populate({
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

// PUT actualizar transacción
router.put("/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      req.body,
      {
        new: true,
        runValidators: true,
      },
    ).populate({
      path: "subAccount",
      match: { user: req.userId },
      populate: {
        path: "account",
        match: { user: req.userId },
      },
    });
    if (!transaction) {
      return res.status(404).json({ message: "Transacción no encontrada" });
    }
    res.json(transaction);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE eliminar transacción
router.delete("/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.userId,
    });
    if (!transaction) {
      return res.status(404).json({ message: "Transacción no encontrada" });
    }

    // Revertir balance de la subcuenta (verificar que pertenece al usuario)
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

    await Transaction.findByIdAndDelete(req.params.id);
    res.json({ message: "Transacción eliminada" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
