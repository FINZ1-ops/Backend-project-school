const express = require("express");
const pool = require("../db/pool");
const verifyRole = require("../middleware/verifyRole");
const router = express.Router();

// ✅ GET semua kategori
/**
 * @swagger
 * /categories:
 *   get:
 *     summary: Ambil semua kategori
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: Berhasil mengambil list kategori
 *       500:
 *         description: Server error
 */

router.get("/", verifyRole(["admin","cashier"]), async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM categories ORDER BY id ASC");
    res.status(200).json({
      status: "success",
      data: result.rows,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ✅ GET kategori berdasarkan ID
/**
 * @swagger
 * /categories/{id}:
 *   get:
 *     summary: Ambil kategori berdasarkan ID
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Kategori ditemukan
 *       404:
 *         description: Kategori tidak ditemukan
 *       500:
 *         description: Server error
 */
router.get("/:id", verifyRole(["admin","cashier"]), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM categories WHERE id = $1", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ status: "error", message: "Kategori tidak ditemukan" });
    }

    res.status(200).json({
      status: "success",
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ✅ POST - Tambah kategori baru
/**
 * @swagger
 * /categories:
 *   post:
 *     summary: Tambah kategori baru
 *     tags: [Categories]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *             required:
 *               - name
 *     responses:
 *       201:
 *         description: Kategori berhasil ditambahkan
 *       400:
 *         description: Nama kategori wajib diisi
 *       500:
 *         description: Server error
 */

router.post("/", verifyRole(["admin"]), async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({
      status: "failed",
      message: "Nama kategori wajib diisi",
    });
  }

  try {
    const result = await pool.query(
      "INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *",
      [name, description || null]
    );

    res.status(201).json({
      status: "success",
      message: "Kategori berhasil ditambahkan",
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ✅ PUT - Update kategori
/**
 * @swagger
 * /categories/{id}:
 *   put:
 *     summary: Update kategori berdasarkan ID
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Kategori berhasil diperbarui
 *       404:
 *         description: Kategori tidak ditemukan
 *       500:
 *         description: Server error
 */

router.put("/:id", verifyRole(["admin"]), async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  try {
    const result = await pool.query(
      `UPDATE categories
       SET name = $1, description = $2
       WHERE id = $3
       RETURNING *`,
      [name, description, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ status: "error", message: "Kategori tidak ditemukan" });
    }

    res.status(200).json({
      status: "success",
      message: "Kategori berhasil diperbarui",
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ✅ DELETE - Hapus kategori
/**
 * @swagger
 * /categories/{id}:
 *   delete:
 *     summary: Hapus kategori berdasarkan ID
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Kategori berhasil dihapus
 *       404:
 *         description: Kategori tidak ditemukan
 *       500:
 *         description: Server error
 */

router.delete("/:id", verifyRole(["admin"]), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("DELETE FROM categories WHERE id = $1", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ status: "error", message: "Kategori tidak ditemukan" });
    }

    res.status(200).json({
      status: "success",
      message: "Kategori berhasil dihapus",
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;