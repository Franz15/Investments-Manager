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
      .populate("collateral", "name type currentPrice quantity currency symbol")
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
    })
      .populate({
        path: "subAccount",
        match: { user: req.userId },
        populate: { path: "account", match: { user: req.userId } },
      })
      .populate("collateral", "name type currentPrice quantity currency symbol");
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

    const body = { ...req.body };
    if (!body.subAccount) delete body.subAccount;
    if (!body.endDate) delete body.endDate;

    const debt = new Debt({
      ...body,
      user: req.userId,
    });
    const savedDebt = await debt.save();
    const populated = await Debt.findById(savedDebt._id)
      .populate({
        path: "subAccount",
        match: { user: req.userId },
        populate: { path: "account", match: { user: req.userId } },
      })
      .populate("collateral", "name type currentPrice quantity currency symbol");
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT actualizar deuda
router.put("/:id", async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.subAccount === "") delete body.subAccount;
    if (body.endDate === "") delete body.endDate;

    const debt = await Debt.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      body,
      { new: true, runValidators: true },
    )
      .populate({
        path: "subAccount",
        match: { user: req.userId },
        populate: { path: "account", match: { user: req.userId } },
      })
      .populate("collateral", "name type currentPrice quantity currency symbol");
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
    const { amount, date, paymentType = "scheduled", earlyRepaymentMode = "reduce_payment" } = req.body;
    const debt = await Debt.findOne({ _id: req.params.id, user: req.userId });

    if (!debt) {
      return res.status(404).json({ message: "Deuda no encontrada" });
    }

    if (paymentType === "early_total") {
      debt.remainingAmount = 0;
      debt.status = "paid";

    } else if (paymentType === "early_partial") {
      if (amount > debt.remainingAmount) {
        return res.status(400).json({ message: "El pago excede el monto pendiente" });
      }
      debt.remainingAmount -= amount;

      if (debt.remainingAmount <= 0) {
        debt.remainingAmount = 0;
        debt.status = "paid";
      } else if (debt.interestRate > 0) {
        const r = debt.interestRate / 100 / 12;
        if (earlyRepaymentMode === "reduce_term" && debt.monthlyPayment > 0) {
          const ratio = (r * debt.remainingAmount) / debt.monthlyPayment;
          if (ratio < 1) {
            const n = -Math.log(1 - ratio) / Math.log(1 + r);
            const newEnd = new Date();
            newEnd.setMonth(newEnd.getMonth() + Math.ceil(n));
            debt.endDate = newEnd;
          }
        } else if (earlyRepaymentMode === "reduce_payment" && debt.endDate) {
          const now = new Date();
          const msPerMonth = 1000 * 60 * 60 * 24 * 30.44;
          const n = Math.ceil((debt.endDate - now) / msPerMonth);
          if (n > 0) {
            if (r > 0) {
              debt.monthlyPayment = (debt.remainingAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
            } else {
              debt.monthlyPayment = debt.remainingAmount / n;
            }
          }
        }
      }

    } else {
      // Pago ordinario: amortización francesa separa capital e interés
      let capitalReduction = amount;
      if (debt.amortizationType === "french" && debt.interestRate > 0) {
        const r = debt.interestRate / 100 / 12;
        const interestPortion = debt.remainingAmount * r;
        capitalReduction = Math.max(0, debt.monthlyPayment - interestPortion);
        if (capitalReduction > debt.remainingAmount) capitalReduction = debt.remainingAmount;
      }
      debt.remainingAmount = Math.max(0, debt.remainingAmount - capitalReduction);
      if (debt.remainingAmount <= 0) {
        debt.remainingAmount = 0;
        debt.status = "paid";
      }
    }

    await debt.save();

    const populated = await Debt.findById(debt._id)
      .populate({ path: "subAccount", populate: { path: "account" } })
      .populate("collateral", "name type currentPrice quantity currency symbol");

    res.json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
