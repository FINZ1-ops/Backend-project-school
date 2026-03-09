const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

/**
 * @swagger
 * tags:
 *   name: Transactions
 *   description: Manajemen transaksi
 */

// =====================================================================
// HELPER: Mapping status transaksi → status order
// paid    → completed  (transaksi lunas, order selesai)
// failed  → cancelled  (transaksi gagal, order dibatalkan)
// pending → processing (transaksi pending, order sedang diproses)
// =====================================================================
function getOrderStatus(transactionStatus) {
  const map = {
    paid: "completed",
    failed: "cancelled",
    pending: "processing",
    refunded: "cancelled",
  };
  return map[transactionStatus] || "processing";
}

// =====================================================================
// HELPER: Ambil detail item dari sebuah order
// =====================================================================
async function getOrderItems(client, orderId) {
  const result = await client.query(
    `SELECT
       op.product_id,
       p.name    AS product_name,
       p.price,
       op.quantity,
       (p.price * op.quantity) AS subtotal
     FROM order_products op
     JOIN products p ON op.product_id = p.id
     WHERE op.order_id = $1`,
    [orderId]
  );
  return result.rows;
}

// =====================================================================
// GET /transactions
// Ambil semua transaksi BESERTA info order-nya
// =====================================================================
/**
 * @swagger
 * /transactions:
 *   get:
 *     summary: Ambil semua transaksi beserta info order
 *     tags: [Transactions]
 *     responses:
 *       200:
 *         description: Berhasil mengambil list transaksi
 *       500:
 *         description: Server error
 */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.order_id,
        t.payment_method,
        t.total_amount,
        t.status,
        o.customer_id,
        o.status     AS order_status,
        o.order_date
      FROM transactions t
      JOIN orders o ON t.order_id = o.id
      ORDER BY t.id ASC
    `);

    res.status(200).json({
      status: "success",
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// =====================================================================
// GET /transactions/:id
// Ambil 1 transaksi BESERTA info order dan item-itemnya
// =====================================================================
/**
 * @swagger
 * /transactions/{id}:
 *   get:
 *     summary: Ambil detail transaksi beserta info order dan item produk
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
 *       500:
 *         description: Server error
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    // Ambil transaksi + info order sekaligus
    const trxResult = await client.query(
      `SELECT
         t.*,
         o.customer_id,
         o.status     AS order_status,
         o.order_date
       FROM transactions t
       JOIN orders o ON t.order_id = o.id
       WHERE t.id = $1`,
      [id]
    );

    if (trxResult.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Transaksi tidak ditemukan",
      });
    }

    const trx = trxResult.rows[0];

    // Ambil item-item dari order ini
    const items = await getOrderItems(client, trx.order_id);
    const total = items.reduce((sum, i) => sum + Number(i.subtotal), 0);

    res.status(200).json({
      status: "success",
      data: {
        ...trx,
        order: {
          customer_id: trx.customer_id,
          status: trx.order_status,
          order_date: trx.order_date,
          items,
          total,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
});

// =====================================================================
// POST /transactions
// Buat transaksi baru → total dihitung otomatis → status order diupdate
//
// Request body:
// {
//   "order_id": 5,
//   "payment_method": "cash",
//   "status": "paid"
// }
// =====================================================================
/**
 * @swagger
 * /transactions:
 *   post:
 *     summary: Buat transaksi baru (total otomatis, status order ikut update)
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order_id
 *             properties:
 *               order_id:
 *                 type: integer
 *                 example: 5
 *               payment_method:
 *                 type: string
 *                 example: "cash"
 *               status:
 *                 type: string
 *                 example: "paid"
 *     responses:
 *       201:
 *         description: Transaksi berhasil dibuat
 *       400:
 *         description: Data tidak valid atau order tidak ditemukan
 *       500:
 *         description: Server error
 */
router.post("/", async (req, res) => {
  const { order_id, payment_method, status } = req.body;

  if (!order_id) {
    return res.status(400).json({
      status: "error",
      message: "order_id wajib diisi",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // LANGKAH 1: Cek order ada
    const orderResult = await client.query(
      "SELECT * FROM orders WHERE id = $1",
      [order_id]
    );
    if (orderResult.rows.length === 0) {
      throw new Error("Order tidak ditemukan");
    }

    // LANGKAH 2: Hitung total otomatis dari item order
    const items = await getOrderItems(client, order_id);
    if (items.length === 0) {
      throw new Error("Order tidak memiliki item produk");
    }
    const total = items.reduce((sum, i) => sum + Number(i.subtotal), 0);

    // LANGKAH 3: Buat transaksi
    const trxResult = await client.query(
      `INSERT INTO transactions (order_id, payment_method, total_amount, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [order_id, payment_method || null, total, status || "pending"]
    );
    const trx = trxResult.rows[0];

    // LANGKAH 4: Update status order otomatis
    const orderStatus = getOrderStatus(trx.status);
    await client.query(
      "UPDATE orders SET status = $1 WHERE id = $2",
      [orderStatus, order_id]
    );

    await client.query("COMMIT");

    res.status(201).json({
      status: "success",
      message: "Transaksi berhasil dibuat",
      data: {
        ...trx,
        order: {
          ...orderResult.rows[0],
          status: orderStatus,
          items,
          total,
        },
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
// PUT /transactions/:id
// Update transaksi → status order ikut berubah otomatis
//
// Request body:
// {
//   "payment_method": "transfer",
//   "status": "paid"
// }
// =====================================================================
/**
 * @swagger
 * /transactions/{id}:
 *   put:
 *     summary: Update transaksi (status order ikut berubah otomatis)
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
 *               status:
 *                 type: string
 *                 enum: [pending, paid, failed, refunded]
 *     responses:
 *       200:
 *         description: Transaksi berhasil diperbarui
 *       404:
 *         description: Transaksi tidak ditemukan
 *       500:
 *         description: Server error
 */
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { payment_method, status } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Cek transaksi ada
    const cekTrx = await client.query(
      "SELECT * FROM transactions WHERE id = $1",
      [id]
    );
    if (cekTrx.rows.length === 0) {
      throw new Error("Transaksi tidak ditemukan");
    }

    // LANGKAH 1: Update transaksi
    const trxResult = await client.query(
      `UPDATE transactions
       SET payment_method = $1, status = $2
       WHERE id = $3
       RETURNING *`,
      [payment_method, status, id]
    );
    const trx = trxResult.rows[0];

    // LANGKAH 2: Update status order otomatis
    const orderStatus = getOrderStatus(trx.status);
    await client.query(
      "UPDATE orders SET status = $1 WHERE id = $2",
      [orderStatus, trx.order_id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      status: "success",
      message: `Transaksi diperbarui, status order menjadi "${orderStatus}"`,
      data: trx,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
});

// =====================================================================
// DELETE /transactions/:id
// Hapus transaksi → status order dikembalikan ke "pending"
// =====================================================================
/**
 * @swagger
 * /transactions/{id}:
 *   delete:
 *     summary: Hapus transaksi (status order dikembalikan ke pending)
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
 *       500:
 *         description: Server error
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ambil data transaksi dulu sebelum dihapus
    const trxResult = await client.query(
      "SELECT * FROM transactions WHERE id = $1",
      [id]
    );
    if (trxResult.rows.length === 0) {
      throw new Error("Transaksi tidak ditemukan");
    }
    const trx = trxResult.rows[0];

    // LANGKAH 1: Kembalikan status order ke pending
    await client.query(
      "UPDATE orders SET status = 'pending' WHERE id = $1",
      [trx.order_id]
    );

    // LANGKAH 2: Hapus transaksi
    await client.query(
      "DELETE FROM transactions WHERE id = $1",
      [id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      status: "success",
      message: "Transaksi berhasil dihapus, status order dikembalikan ke pending",
      data: trx,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;