import express from "express";
import Category from "../models/Category.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// GET todas las categorías
router.get("/", async (req, res) => {
  try {
    const { type, isActive, business } = req.query;
    const query = { user: req.userId };

    if (type) {
      query.type = type;
    }
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    // Filtro por negocio: null o "" = categorías personales o compartidas (sin negocio)
    if (business !== undefined) {
      if (business === "null" || business === "") {
        query.business = null;
      } else {
        query.business = business;
      }
    }

    const categories = await Category.find(query)
      .populate("parentCategory", "name")
      .populate("business", "name color")
      .sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET categoría por ID
router.get("/:id", async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      user: req.userId,
    }).populate("parentCategory", "name");
    if (!category) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST crear nueva categoría
router.post("/", async (req, res) => {
  try {
    const category = new Category({
      ...req.body,
      user: req.userId,
    });
    const savedCategory = await category.save();
    res.status(201).json(savedCategory);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT actualizar categoría
router.put("/:id", async (req, res) => {
  try {
    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      req.body,
      {
        new: true,
        runValidators: true,
      },
    );
    if (!category) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }
    res.json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE eliminar categoría
router.delete("/:id", async (req, res) => {
  try {
    const category = await Category.findOneAndDelete({
      _id: req.params.id,
      user: req.userId,
    });
    if (!category) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }
    res.json({ message: "Categoría eliminada" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
