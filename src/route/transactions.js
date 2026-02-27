const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

/**
 * @swagger
 * tags:
 *   name: Transactions
 *   description: Manajemen transaksi
 */

// ==============================
// GET semua transaksi
// ==============================
/**
 * @swagger
 * /transactions:
 *   get:
 *     summary: Ambil semua transaksi
 *     tags: [Transactions]
 *     responses:
 *       200:
 *         description: Berhasil mengambil list transaksi
 */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        t.id,
        t.order_id,
        t.payment_method,
        t.total_amount,
        t.status
      FROM transactions t
      ORDER BY t.id ASC
    `);

    res.status(200).json({
      status: "success",
      count: rows.length,
      data: rows
    });
  } catch (e) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});


// ==============================
// GET transaksi by ID
// ==============================
/**
 * @swagger
 * /transactions/{id}:
 *   get:
 *     summary: Ambil detail transaksi berdasarkan ID
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Transaksi ditemukan
 *       404:
 *         description: Transaksi tidak ditemukan
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM transactions WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Transaksi tidak ditemukan"
      });
    }

    res.status(200).json({
      status: "success",
      data: rows[0]
    });
  } catch (e) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});


// ==============================
// CREATE transaksi
// ==============================
/**
 * @swagger
 * /transactions:
 *   post:
 *     summary: Membuat transaksi baru
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order_id
 *               - total_amount
 *             properties:
 *               order_id:
 *                 type: integer
 *               payment_method:
 *                 type: string
 *               total_amount:
 *                 type: number
 *               status:
 *                 type: string
 *     responses:
 *       201:
 *         description: Transaksi berhasil dibuat
 */
router.post("/", async (req, res) => {
  const { order_id, payment_method, total_amount, status } = req.body;

  if (!order_id || !total_amount) {
    return res.status(400).json({
      status: "error",
      message: "order_id dan total_amount wajib diisi"
    });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO transactions (order_id, payment_method, total_amount, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [order_id, payment_method || null, total_amount, status || "pending"]
    );

    res.status(201).json({
      status: "success",
      message: "Transaksi berhasil dibuat",
      data: rows[0]
    });
  } catch (e) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});


// ==============================
// UPDATE transaksi
// ==============================
/**
 * @swagger
 * /transactions/{id}:
 *   put:
 *     summary: Update transaksi berdasarkan ID
 *     tags: [Transactions]
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
 *               payment_method:
 *                 type: string
 *               total_amount:
 *                 type: number
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transaksi berhasil diperbarui
 *       404:
 *         description: Transaksi tidak ditemukan
 */
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { payment_method, total_amount, status } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE transactions
       SET payment_method = $1,
           total_amount = $2,
           status = $3
       WHERE id = $4
       RETURNING *`,
      [payment_method, total_amount, status, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Transaksi tidak ditemukan"
      });
    }

    res.status(200).json({
      status: "success",
      message: "Transaksi berhasil diperbarui",
      data: rows[0]
    });
  } catch (e) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});


// ==============================
// DELETE transaksi
// ==============================
/**
 * @swagger
 * /transactions/{id}:
 *   delete:
 *     summary: Hapus transaksi berdasarkan ID
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Transaksi berhasil dihapus
 *       404:
 *         description: Transaksi tidak ditemukan
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM transactions WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Transaksi tidak ditemukan"
      });
    }

    res.status(200).json({
      status: "success",
      message: "Transaksi berhasil dihapus"
    });
  } catch (e) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

module.exports = router;
  