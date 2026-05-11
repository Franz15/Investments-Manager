import express from "express";
import Forecast from "../models/Forecast.js";
import Category from "../models/Category.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// GET todas las previsiones
router.get("/", async (req, res) => {
  try {
    const { type, isActive, startDate, endDate, business } = req.query;
    const query = { user: req.userId };

    if (type) {
      query.type = type;
    }
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

    const forecasts = await Forecast.find(query)
      .populate("category", "name type color")
      .populate("business", "name color")
      .sort({ startDate: -1 });
    res.json(forecasts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET previsión por ID
router.get("/:id", async (req, res) => {
  try {
    const forecast = await Forecast.findOne({
      _id: req.params.id,
      user: req.userId,
    }).populate("category", "name type color");

    if (!forecast) {
      return res.status(404).json({ message: "Previsión no encontrada" });
    }
    res.json(forecast);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET proyecciones calculadas para un rango de fechas
router.get("/projections/calculate", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ message: "Se requieren startDate y endDate" });
    }

    const forecasts = await Forecast.find({
      user: req.userId,
      isActive: true,
      $or: [{ endDate: null }, { endDate: { $gte: new Date(startDate) } }],
      startDate: { $lte: new Date(endDate) },
    }).populate("category", "name type color");

    const projections = [];

    forecasts.forEach((forecast) => {
      const start = new Date(
        Math.max(new Date(startDate), new Date(forecast.startDate)),
      );
      const end = new Date(
        Math.min(
          new Date(endDate),
          forecast.endDate ? new Date(forecast.endDate) : new Date(endDate),
        ),
      );

      if (forecast.frequency === "one-time") {
        if (start <= end) {
          projections.push({
            forecastId: forecast._id,
            forecastName: forecast.name,
            type: forecast.type,
            category: forecast.category,
            date: start,
            amount: forecast.amount,
            currency: forecast.currency,
          });
        }
      } else {
        // Calcular ocurrencias según frecuencia
        const dates = calculateOccurrences(start, end, forecast.frequency);
        dates.forEach((date) => {
          projections.push({
            forecastId: forecast._id,
            forecastName: forecast.name,
            type: forecast.type,
            category: forecast.category,
            date,
            amount: forecast.amount,
            currency: forecast.currency,
          });
        });
      }
    });

    // Ordenar por fecha
    projections.sort((a, b) => a.date - b.date);

    res.json(projections);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Función auxiliar para calcular ocurrencias según frecuencia
function calculateOccurrences(start, end, frequency) {
  const dates = [];
  const current = new Date(start);

  while (current <= end) {
    dates.push(new Date(current));

    switch (frequency) {
      case "daily":
        current.setDate(current.getDate() + 1);
        break;
      case "weekly":
        current.setDate(current.getDate() + 7);
        break;
      case "biweekly":
        current.setDate(current.getDate() + 14);
        break;
      case "monthly":
        current.setMonth(current.getMonth() + 1);
        break;
      case "quarterly":
        current.setMonth(current.getMonth() + 3);
        break;
      case "yearly":
        current.setFullYear(current.getFullYear() + 1);
        break;
      default:
        break;
    }
  }

  return dates;
}

// POST crear nueva previsión
router.post("/", async (req, res) => {
  try {
    // Verificar que la categoría pertenece al usuario si se proporciona
    if (req.body.category) {
      const category = await Category.findOne({
        _id: req.body.category,
        user: req.userId,
      });

      if (!category) {
        return res.status(404).json({ message: "Categoría no encontrada" });
      }
    }

    const forecast = new Forecast({
      ...req.body,
      user: req.userId,
    });
    const savedForecast = await forecast.save();
    const populatedForecast = await Forecast.findById(
      savedForecast._id,
    ).populate("category", "name type color");
    res.status(201).json(populatedForecast);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT actualizar previsión
router.put("/:id", async (req, res) => {
  try {
    const forecast = await Forecast.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      req.body,
      {
        new: true,
        runValidators: true,
      },
    ).populate("category", "name type color");

    if (!forecast) {
      return res.status(404).json({ message: "Previsión no encontrada" });
    }
    res.json(forecast);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE eliminar previsión
router.delete("/:id", async (req, res) => {
  try {
    const forecast = await Forecast.findOneAndDelete({
      _id: req.params.id,
      user: req.userId,
    });
    if (!forecast) {
      return res.status(404).json({ message: "Previsión no encontrada" });
    }
    res.json({ message: "Previsión eliminada" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
