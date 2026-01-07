import express from "express";
import Business from "../models/Business.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// GET todos los negocios
router.get("/", async (req, res) => {
  try {
    const { isActive, type } = req.query;
    const query = { user: req.userId };

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }
    if (type) {
      query.type = type;
    }

    const businesses = await Business.find(query).sort({ createdAt: -1 });
    res.json(businesses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET negocio por ID
router.get("/:id", async (req, res) => {
  try {
    const business = await Business.findOne({
      _id: req.params.id,
      user: req.userId,
    });
    if (!business) {
      return res.status(404).json({ message: "Negocio no encontrado" });
    }
    res.json(business);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST crear nuevo negocio
router.post("/", async (req, res) => {
  try {
    const business = new Business({
      ...req.body,
      user: req.userId,
    });
    const savedBusiness = await business.save();
    res.status(201).json(savedBusiness);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT actualizar negocio
router.put("/:id", async (req, res) => {
  try {
    const business = await Business.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      req.body,
      {
        new: true,
        runValidators: true,
      },
    );
    if (!business) {
      return res.status(404).json({ message: "Negocio no encontrado" });
    }
    res.json(business);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE eliminar negocio
router.delete("/:id", async (req, res) => {
  try {
    const business = await Business.findOneAndDelete({
      _id: req.params.id,
      user: req.userId,
    });
    if (!business) {
      return res.status(404).json({ message: "Negocio no encontrado" });
    }
    res.json({ message: "Negocio eliminado" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
