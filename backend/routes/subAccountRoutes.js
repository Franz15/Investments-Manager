import express from "express";
import SubAccount from "../models/SubAccount.js";
import Account from "../models/Account.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// GET todas las subcuentas
router.get("/", async (req, res) => {
  try {
    const { accountId } = req.query;
    const query = { user: req.userId };
    if (accountId) query.account = accountId;

    const subAccounts = await SubAccount.find(query)
      .populate({
        path: "account",
        select: "name bankName",
      })
      .sort({ createdAt: -1 });

    res.json(subAccounts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET subcuenta por ID
router.get("/:id", async (req, res) => {
  try {
    const subAccount = await SubAccount.findOne({
      _id: req.params.id,
      user: req.userId,
    }).populate({
      path: "account",
      select: "name bankName",
      match: { user: req.userId },
    });
    if (!subAccount) {
      return res.status(404).json({ message: "Subcuenta no encontrada" });
    }
    res.json(subAccount);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST crear nueva subcuenta
router.post("/", async (req, res) => {
  try {
    // Verificar que la cuenta principal existe y pertenece al usuario
    const account = await Account.findOne({
      _id: req.body.account,
      user: req.userId,
    });
    if (!account) {
      return res
        .status(404)
        .json({ message: "Cuenta principal no encontrada" });
    }

    const subAccount = new SubAccount({
      ...req.body,
      user: req.userId,
    });
    const savedSubAccount = await subAccount.save();
    const populated = await SubAccount.findById(savedSubAccount._id).populate({
      path: "account",
      select: "name bankName",
      match: { user: req.userId },
    });
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT actualizar subcuenta
router.put("/:id", async (req, res) => {
  try {
    const subAccount = await SubAccount.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      req.body,
      {
        new: true,
        runValidators: true,
      },
    ).populate({
      path: "account",
      select: "name bankName",
      match: { user: req.userId },
    });
    if (!subAccount) {
      return res.status(404).json({ message: "Subcuenta no encontrada" });
    }
    res.json(subAccount);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE eliminar subcuenta (eliminación real)
router.delete("/:id", async (req, res) => {
  try {
    const subAccount = await SubAccount.findOne({
      _id: req.params.id,
      user: req.userId,
    });
    if (!subAccount) {
      return res.status(404).json({ message: "Subcuenta no encontrada" });
    }

    if (subAccount.type === "cash" && subAccount.name === "Efectivo") {
      return res
        .status(400)
        .json({ message: "No se puede eliminar la subcuenta Efectivo" });
    }

    // Eliminar la subcuenta
    await SubAccount.findByIdAndDelete(req.params.id);

    res.json({ message: "Subcuenta eliminada" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
