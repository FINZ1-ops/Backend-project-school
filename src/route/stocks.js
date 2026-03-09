const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

/**
 * @swagger
 * tags:
 *   name: Stocks
 *   description: Manajemen riwayat stok
 */

const ALLOWED_ACTIONS = ["masuk", "keluar"];

// =====================================================================
// GET /stocks
// Ambil semua riwayat stok beserta nama produk
// =====================================================================
/**
 * @swagger
 * /stocks:
 *   get:
 *     summary: Ambil semua riwayat stok
 *     tags: [Stocks]
 *     responses:
 *       200:
 *         description: Berhasil mengambil list riwayat stok
 *       500:
 *         description: Server error
 */
router.get("/", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, p.name AS product_name, p.stock AS stock_sekarang
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

// =====================================================================
// GET /stocks/product/:product_id
// Ambil riwayat stok berdasarkan produk tertentu
// =====================================================================
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
 *         description: Produk tidak ditemukan
 *       500:
 *         description: Server error
 */
router.get("/product/:product_id", async (req, res) => {
  const { product_id } = req.params;
  try {
    // Cek produk ada
    const produk = await pool.query(
      "SELECT id, name, stock FROM products WHERE id = $1",
      [product_id]
    );
    if (produk.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Produk tidak ditemukan" });
    }

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
      product: produk.rows[0],       // info produk + stok sekarang
      total_riwayat: result.rowCount,
      data: result.rows,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// =====================================================================
// POST /stocks
// Tambah riwayat stok — stok produk otomatis bertambah atau berkurang
//
// action "masuk"  → stok produk BERTAMBAH
// action "keluar" → stok produk BERKURANG (cek stok cukup dulu)
//
// Request body:
// {
//   "product_id": 1,
//   "quantity_change": 10,
//   "action": "masuk"
// }
// =====================================================================
/**
 * @swagger
 * /stocks:
 *   post:
 *     summary: Tambah riwayat stok (stok produk otomatis update)
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
 *                 example: 1
 *               quantity_change:
 *                 type: integer
 *                 example: 10
 *               action:
 *                 type: string
 *                 enum: [masuk, keluar]
 *     responses:
 *       201:
 *         description: Riwayat stok berhasil ditambahkan
 *       400:
 *         description: Input tidak valid atau stok tidak cukup
 *       500:
 *         description: Server error
 */
router.post("/", async (req, res) => {
  const { product_id, quantity_change, action } = req.body;

  // Validasi input
  if (!product_id || !quantity_change || !action) {
    return res.status(400).json({
      status: "error",
      message: "product_id, quantity_change, dan action wajib diisi",
    });
  }
  if (!ALLOWED_ACTIONS.includes(action)) {
    return res.status(400).json({
      status: "error",
      message: 'action hanya boleh "masuk" atau "keluar"',
    });
  }
  if (quantity_change <= 0) {
    return res.status(400).json({
      status: "error",
      message: "quantity_change harus lebih dari 0",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Cek produk ada
    const produkResult = await client.query(
      "SELECT id, name, stock FROM products WHERE id = $1",
      [product_id]
    );
    if (produkResult.rows.length === 0) {
      throw new Error("Produk tidak ditemukan");
    }
    const produk = produkResult.rows[0];

    // Kalau action "keluar", cek stok cukup
    if (action === "keluar" && produk.stock < quantity_change) {
      throw new Error(
        `Stok produk "${produk.name}" tidak cukup. Stok tersedia: ${produk.stock}`
      );
    }

    // Catat riwayat stok
    const stockResult = await client.query(
      `INSERT INTO stocks (product_id, quantity_change, action)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [product_id, quantity_change, action]
    );

    // Update stok produk
    // masuk  → tambah stok
    // keluar → kurangi stok
    const operator = action === "masuk" ? "+" : "-";
    await client.query(
      `UPDATE products SET stock = stock ${operator} $1 WHERE id = $2`,
      [quantity_change, product_id]
    );

    // Ambil stok terbaru setelah update
    const stokBaru = await client.query(
      "SELECT stock FROM products WHERE id = $1",
      [product_id]
    );

    await client.query("COMMIT");

    res.status(201).json({
      status: "success",
      message: `Stok berhasil ${action === "masuk" ? "ditambahkan" : "dikurangi"}`,
      data: {
        ...stockResult.rows[0],
        product_name: produk.name,
        stok_sebelum: produk.stock,
        stok_sesudah: stokBaru.rows[0].stock,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
});

// =====================================================================
// PUT /stocks/:id
// Update riwayat stok — stok produk disesuaikan ulang
// =====================================================================
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
 *                 enum: [masuk, keluar]
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

  if (action && !ALLOWED_ACTIONS.includes(action)) {
    return res.status(400).json({
      status: "error",
      message: 'action hanya boleh "masuk" atau "keluar"',
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ambil data stok lama
    const stokLama = await client.query(
      "SELECT * FROM stocks WHERE id = $1",
      [id]
    );
    if (stokLama.rows.length === 0) {
      throw new Error("Riwayat stok tidak ditemukan");
    }
    const lama = stokLama.rows[0];

    // Kembalikan efek stok lama dulu
    const operatorKembalikan = lama.action === "masuk" ? "-" : "+";
    await client.query(
      `UPDATE products SET stock = stock ${operatorKembalikan} $1 WHERE id = $2`,
      [lama.quantity_change, lama.product_id]
    );

    // Update data riwayat stok
    const newQty    = quantity_change ?? lama.quantity_change;
    const newAction = action ?? lama.action;

    const result = await client.query(
      `UPDATE stocks SET quantity_change = $1, action = $2 WHERE id = $3 RETURNING *`,
      [newQty, newAction, id]
    );

    // Terapkan efek stok baru
    const operatorBaru = newAction === "masuk" ? "+" : "-";
    await client.query(
      `UPDATE products SET stock = stock ${operatorBaru} $1 WHERE id = $2`,
      [newQty, lama.product_id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      status: "success",
      message: "Riwayat stok berhasil diperbarui",
      data: result.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
});

// =====================================================================
// DELETE /stocks/:id
// Hapus riwayat stok — stok produk dikembalikan ke kondisi sebelumnya
// =====================================================================
/**
 * @swagger
 * /stocks/{id}:
 *   delete:
 *     summary: Hapus riwayat stok (stok produk dikembalikan)
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ambil data sebelum dihapus
    const result = await client.query(
      "SELECT * FROM stocks WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      throw new Error("Riwayat stok tidak ditemukan");
    }
    const stok = result.rows[0];

    // Kembalikan stok produk
    // Kalau dulu "masuk" → sekarang dikurangi balik
    // Kalau dulu "keluar" → sekarang ditambah balik
    const operator = stok.action === "masuk" ? "-" : "+";
    await client.query(
      `UPDATE products SET stock = stock ${operator} $1 WHERE id = $2`,
      [stok.quantity_change, stok.product_id]
    );

    // Hapus riwayat
    await client.query("DELETE FROM stocks WHERE id = $1", [id]);

    await client.query("COMMIT");

    res.status(200).json({
      status: "success",
      message: "Riwayat stok dihapus dan stok produk dikembalikan",
      data: stok,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;