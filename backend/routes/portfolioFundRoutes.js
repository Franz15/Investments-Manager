import express from "express";
import mongoose from "mongoose";
import PortfolioFund from "../models/PortfolioFund.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Obtener todos los fondos del usuario, opcionalmente filtrados por categoría
router.get("/", async (req, res) => {
  try {
    const { category } = req.query;
    const query = { user: req.userId };

    if (category) {
      query.category = category;
    }

    const funds = await PortfolioFund.find(query).sort({
      category: 1,
      name: 1,
    });
    res.json(funds);
  } catch (error) {
    console.error("Error al obtener fondos:", error);
    res.status(500).json({ message: "Error al obtener fondos" });
  }
});

// Obtener fondos por categoría
router.get("/category/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const funds = await PortfolioFund.find({
      user: req.userId,
      category: category,
    }).sort({ name: 1 });
    res.json(funds);
  } catch (error) {
    console.error("Error al obtener fondos por categoría:", error);
    res.status(500).json({ message: "Error al obtener fondos por categoría" });
  }
});

// Crear un nuevo fondo
router.post("/", async (req, res) => {
  try {
    const fund = new PortfolioFund({
      ...req.body,
      user: req.userId,
    });
    await fund.save();
    res.status(201).json(fund);
  } catch (error) {
    console.error("Error al crear fondo:", error);
    res
      .status(400)
      .json({ message: "Error al crear fondo", error: error.message });
  }
});

// Actualizar un fondo
router.put("/:id", async (req, res) => {
  try {
    const fund = await PortfolioFund.findOne({
      _id: req.params.id,
      user: req.userId,
    });

    if (!fund) {
      return res.status(404).json({ message: "Fondo no encontrado" });
    }

    Object.assign(fund, req.body);
    await fund.save();
    res.json(fund);
  } catch (error) {
    console.error("Error al actualizar fondo:", error);
    res
      .status(400)
      .json({ message: "Error al actualizar fondo", error: error.message });
  }
});

// Eliminar un fondo
router.delete("/:id", async (req, res) => {
  try {
    const fund = await PortfolioFund.findOneAndDelete({
      _id: req.params.id,
      user: req.userId,
    });

    if (!fund) {
      return res.status(404).json({ message: "Fondo no encontrado" });
    }

    res.json({ message: "Fondo eliminado correctamente" });
  } catch (error) {
    console.error("Error al eliminar fondo:", error);
    res.status(500).json({ message: "Error al eliminar fondo" });
  }
});

// Obtener estadísticas de fondos por categoría
router.get("/stats/by-category", async (req, res) => {
  try {
    const stats = await PortfolioFund.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(req.userId) } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(stats);
  } catch (error) {
    console.error("Error al obtener estadísticas:", error);
    res.status(500).json({ message: "Error al obtener estadísticas" });
  }
});

export default router;
