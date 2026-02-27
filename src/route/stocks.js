const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

/**
 * @swagger
 * tags:
 *   name: Stocks
 *   description: Manajemen riwayat stok
 */

/**
 * @swagger
 * /stocks:
 *   get:
 *     summary: Ambil semua riwayat stok
 *     tags: [Stocks]
 *     responses:
 *       200:
 *         description: Berhasil mengambil list riwayat stok
 */
router.get("/", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, p.name AS product_name
       FROM stocks s
       JOIN products p ON s.product_id = p.id
       ORDER BY s.id DESC`
    );
    res.status(200).json({
      status: "success",
      total: result.rowCount,
      data: result.rows,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * @swagger
 * /stocks/product/{product_id}:
 *   get:
 *     summary: Ambil riwayat stok berdasarkan ID produk
 *     tags: [Stocks]
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Berhasil mengambil riwayat stok produk
 *       404:
 *         description: Riwayat stok tidak ditemukan
 *       500:
 *         description: Server error
 */
router.get("/product/:product_id", async (req, res) => {
  const { product_id } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT s.*, p.name AS product_name
       FROM stocks s
       JOIN products p ON s.product_id = p.id
       WHERE s.product_id = $1
       ORDER BY s.created_at DESC`,
      [product_id]
    );

    res.status(200).json({
      status: "success",
      total: result.rowCount,
      data: result.rows,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * @swagger
 * /stocks:
 *   post:
 *     summary: Tambah riwayat stok baru
 *     tags: [Stocks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_id
 *               - quantity_change
 *               - action
 *             properties:
 *               product_id:
 *                 type: integer
 *               quantity_change:
 *                 type: integer
 *               action:
 *                 type: string
 *     responses:
 *       201:
 *         description: Riwayat stok berhasil ditambahkan
 *       400:
 *         description: Semua field wajib diisi
 *       500:
 *         description: Server error
 */
router.post("/", async (req, res) => {
  const { product_id, quantity_change, action } = req.body;

  if (!product_id || !quantity_change || !action) {
    return res.status(400).json({
      status: "failed",
      message: "Semua field wajib diisi (product_id, quantity_change, action)",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO stocks (product_id, quantity_change, action)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [product_id, quantity_change, action]
    );

    await pool.query(
      `UPDATE products
       SET stock = stock + $1
       WHERE id = $2`,
      [quantity_change, product_id]
    );

    res.status(201).json({
      status: "success",
      message: "Riwayat stok berhasil ditambahkan dan stok produk diperbarui",
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * @swagger
 * /stocks/{id}:
 *   put:
 *     summary: Update riwayat stok
 *     tags: [Stocks]
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
 *               quantity_change:
 *                 type: integer
 *               action:
 *                 type: string
 *     responses:
 *       200:
 *         description: Riwayat stok berhasil diperbarui
 *       404:
 *         description: Riwayat stok tidak ditemukan
 *       500:
 *         description: Server error
 */
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { quantity_change, action } = req.body;

  try {
    const result = await pool.query(
      `UPDATE stocks
       SET quantity_change = $1, action = $2
       WHERE id = $3
       RETURNING *`,
      [quantity_change, action, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ status: "error", message: "Riwayat stok tidak ditemukan" });
    }

    res.status(200).json({
      status: "success",
      message: "Riwayat stok berhasil diperbarui",
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * @swagger
 * /stocks/{id}:
 *   delete:
 *     summary: Hapus riwayat stok
 *     tags: [Stocks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Riwayat stok berhasil dihapus
 *       404:
 *         description: Riwayat stok tidak ditemukan
 *       500:
 *         description: Server error
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      `DELETE FROM stocks WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Riwayat stok tidak ditemukan",
      });
    }

    res.status(200).json({
      status: "success",
      message: "Riwayat stok berhasil dihapus",
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;
