import express from "express";
import Budget from "../models/Budget.js";
import Category from "../models/Category.js";
import Transaction from "../models/Transaction.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// GET todos los presupuestos
router.get("/", async (req, res) => {
  try {
    const { isActive, startDate, endDate, business } = req.query;
    const query = { user: req.userId };

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }

    // Filtro por negocio
    if (business !== undefined) {
      if (business === "null" || business === "") {
        query.business = null;
      } else {
        query.business = business;
      }
    }

    const budgets = await Budget.find(query)
      .populate("category", "name type color")
      .populate("business", "name color")
      .sort({ startDate: -1 });
    res.json(budgets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET presupuesto por ID con estadísticas
router.get("/:id", async (req, res) => {
  try {
    const budget = await Budget.findOne({
      _id: req.params.id,
      user: req.userId,
    }).populate("category", "name type color");

    if (!budget) {
      return res.status(404).json({ message: "Presupuesto no encontrado" });
    }

    // Calcular gastos reales para este presupuesto
    const startDate = budget.startDate;
    const endDate = budget.endDate || new Date();

    const transactions = await Transaction.find({
      user: req.userId,
      category: budget.category.name,
      type: "expense",
      date: { $gte: startDate, $lte: endDate },
    });

    const spent = transactions.reduce((sum, t) => sum + t.amount, 0);
    const remaining = budget.amount - spent;
    const percentageUsed =
      budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

    res.json({
      ...budget.toObject(),
      statistics: {
        spent,
        remaining,
        percentageUsed: Math.round(percentageUsed * 100) / 100,
        transactionCount: transactions.length,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET estadísticas de presupuestos
router.get("/statistics/overview", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { user: req.userId, isActive: true };

    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }

    const budgets = await Budget.find(query).populate("category", "name type");

    const statistics = await Promise.all(
      budgets.map(async (budget) => {
        const budgetStartDate = budget.startDate;
        const budgetEndDate = budget.endDate || new Date();

        const transactions = await Transaction.find({
          user: req.userId,
          category: budget.category.name,
          type: "expense",
          date: { $gte: budgetStartDate, $lte: budgetEndDate },
        });

        const spent = transactions.reduce((sum, t) => sum + t.amount, 0);
        const remaining = budget.amount - spent;
        const percentageUsed =
          budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

        return {
          budgetId: budget._id,
          budgetName: budget.name,
          categoryName: budget.category.name,
          budgeted: budget.amount,
          spent,
          remaining,
          percentageUsed: Math.round(percentageUsed * 100) / 100,
        };
      }),
    );

    res.json(statistics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST crear nuevo presupuesto
router.post("/", async (req, res) => {
  try {
    // Verificar que la categoría pertenece al usuario
    const category = await Category.findOne({
      _id: req.body.category,
      user: req.userId,
    });

    if (!category) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }

    const budget = new Budget({
      ...req.body,
      user: req.userId,
    });
    const savedBudget = await budget.save();
    const populatedBudget = await Budget.findById(savedBudget._id).populate(
      "category",
      "name type color",
    );
    res.status(201).json(populatedBudget);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT actualizar presupuesto
router.put("/:id", async (req, res) => {
  try {
    const budget = await Budget.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      req.body,
      {
        new: true,
        runValidators: true,
      },
    ).populate("category", "name type color");

    if (!budget) {
      return res.status(404).json({ message: "Presupuesto no encontrado" });
    }
    res.json(budget);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE eliminar presupuesto
router.delete("/:id", async (req, res) => {
  try {
    const budget = await Budget.findOneAndDelete({
      _id: req.params.id,
      user: req.userId,
    });
    if (!budget) {
      return res.status(404).json({ message: "Presupuesto no encontrado" });
    }
    res.json({ message: "Presupuesto eliminado" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
