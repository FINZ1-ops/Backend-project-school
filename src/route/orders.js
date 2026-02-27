const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

// ✅ GET semua order
/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Ambil semua order
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: Berhasil mengambil list order
 *       500:
 *         description: Server error
 */

router.get("/", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY id ASC");
    res.status(200).json({
      status: "success",
      data: result.rows,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ✅ GET order berdasarkan ID
/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: Ambil detail order berdasarkan ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Order ditemukan
 *       404:
 *         description: Order tidak ditemukan
 *       500:
 *         description: Server error
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Order tidak ditemukan" });
    }
    res.status(200).json({
      status: "success",
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ✅ GET order berdasarkan tanggal
/**
 * @swagger
 * /orders/date/{date}:
 *   get:
 *     summary: Ambil order berdasarkan tanggal
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           example: "2025-01-01"
 *     responses:
 *       200:
 *         description: Berhasil mengambil order berdasarkan tanggal
 *       500:
 *         description: Server error
 */
router.get("/date/:date", async (req, res) => {
  const { date } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM orders WHERE DATE(order_date) = $1",
      [date]
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

// ✅ GET order berdasarkan customer
/**
 * @swagger
 * /orders/customer/{customer_id}:
 *   get:
 *     summary: Ambil semua order berdasarkan customer
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: customer_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Berhasil mengambil order customer
 *       500:
 *         description: Server error
 */

router.get("/customer/:customer_id", async (req, res) => {
  const { customer_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM orders WHERE customer_id = $1 ORDER BY id DESC",
      [customer_id]
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

// ✅ Tambah order baru
/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Tambah order baru
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customer_id:
 *                 type: integer
 *               status:
 *                 type: string
 *             required:
 *               - customer_id
 *     responses:
 *       201:
 *         description: Order berhasil ditambahkan
 *       500:
 *         description: Server error
 */

router.post("/", async (req, res) => {
  const { customer_id, status } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO orders (customer_id, status)
       VALUES ($1, $2)
       RETURNING *`,
      [customer_id, status]
    );
    res.status(201).json({
      status: "success",
      message: "Order berhasil ditambahkan",
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ✅ Update order
/**
 * @swagger
 * /orders/{id}:
 *   put:
 *     summary: Update order berdasarkan ID
 *     tags: [Orders]
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
 *               customer_id:
 *                 type: integer
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order berhasil diperbarui
 *       404:
 *         description: Order tidak ditemukan
 *       500:
 *         description: Server error
 */
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { customer_id, status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE orders
       SET customer_id = $1, status = $2
       WHERE id = $3
       RETURNING *`,
      [customer_id, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Order tidak ditemukan" });
    }

    res.status(200).json({
      status: "success",
      message: "Order berhasil diperbarui",
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ✅ Hapus order
/**
 * @swagger
 * /orders/{id}:
 *   delete:
 *     summary: Hapus order berdasarkan ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Order berhasil dihapus
 *       404:
 *         description: Order tidak ditemukan
 *       500:
 *         description: Server error
 */

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM orders WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Order tidak ditemukan" });
    }
    res.status(200).json({
      status: "success",
      message: "Order berhasil dihapus",
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;
