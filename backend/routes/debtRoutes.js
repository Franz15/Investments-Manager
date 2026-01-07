import express from "express";
import Debt from "../models/Debt.js";
import SubAccount from "../models/SubAccount.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// GET todas las deudas
router.get("/", async (req, res) => {
  try {
    const { status, type } = req.query;
    const query = { user: req.userId };

    if (status) query.status = status;
    if (type) query.type = type;

    const debts = await Debt.find(query)
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
      .sort({ createdAt: -1 });
    res.json(debts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET deuda por ID
router.get("/:id", async (req, res) => {
  try {
    const debt = await Debt.findOne({
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
    if (!debt) {
      return res.status(404).json({ message: "Deuda no encontrada" });
    }
    res.json(debt);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST crear nueva deuda
router.post("/", async (req, res) => {
  try {
    // Si hay subAccount, verificar que existe y pertenece al usuario
    if (req.body.subAccount) {
      const subAccount = await SubAccount.findOne({
        _id: req.body.subAccount,
        user: req.userId,
      });
      if (!subAccount) {
        return res.status(404).json({ message: "Subcuenta no encontrada" });
      }
    }

    const debt = new Debt({
      ...req.body,
      user: req.userId,
    });
    const savedDebt = await debt.save();
    const populated = await Debt.findById(savedDebt._id).populate({
      path: "subAccount",
      match: { user: req.userId },
      populate: {
        path: "account",
        match: { user: req.userId },
      },
    });
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT actualizar deuda
router.put("/:id", async (req, res) => {
  try {
    const debt = await Debt.findOneAndUpdate(
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
    if (!debt) {
      return res.status(404).json({ message: "Deuda no encontrada" });
    }
    res.json(debt);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE eliminar deuda
router.delete("/:id", async (req, res) => {
  try {
    const debt = await Debt.findOne({ _id: req.params.id, user: req.userId });
    if (!debt) {
      return res.status(404).json({ message: "Deuda no encontrada" });
    }
    await Debt.findByIdAndDelete(req.params.id);
    res.json({ message: "Deuda eliminada" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST registrar pago de deuda
router.post("/:id/payment", async (req, res) => {
  try {
    const { amount, date } = req.body;
    const debt = await Debt.findOne({ _id: req.params.id, user: req.userId });

    if (!debt) {
      return res.status(404).json({ message: "Deuda no encontrada" });
    }

    if (debt.remainingAmount < amount) {
      return res
        .status(400)
        .json({ message: "El pago excede el monto pendiente" });
    }

    debt.remainingAmount -= amount;

    // Si se pagó completamente, cambiar estado
    if (debt.remainingAmount <= 0) {
      debt.remainingAmount = 0;
      debt.status = "paid";
    }

    await debt.save();

    const populated = await Debt.findById(debt._id).populate({
      path: "subAccount",
      populate: {
        path: "account",
      },
    });

    res.json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
