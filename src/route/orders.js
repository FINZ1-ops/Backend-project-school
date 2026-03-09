const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

// =====================================================================
// HELPER: Ambil detail items dari sebuah order
// Dipakai berulang di GET / dan GET /:id
// =====================================================================
async function getOrderItems(client, orderId) {
  const result = await client.query(
    `SELECT
       op.id,
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
// GET /orders
// =====================================================================
/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Ambil semua order beserta item produk
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: Berhasil mengambil list order
 *       500:
 *         description: Server error
 */
router.get("/", async (_req, res) => {
  const client = await pool.connect();
  try {
    // Ambil semua order (MASTER)
    const orders = await client.query("SELECT * FROM orders ORDER BY id ASC");

    // Untuk setiap order, ambil item-itemnya (DETAIL)
    const result = await Promise.all(
      orders.rows.map(async (order) => {
        const items = await getOrderItems(client, order.id);
        const total = items.reduce((sum, i) => sum + Number(i.subtotal), 0);
        return { ...order, items, total };
      })
    );

    res.status(200).json({
      status: "success",
      count: result.length,
      data: result,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
});

// =====================================================================
// GET /orders/date/:date
// Ambil order berdasarkan tanggal BESERTA item-itemnya
// Harus di atas GET /:id supaya tidak tertimpa
// =====================================================================
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
 *           example: "2026-02-25"
 *     responses:
 *       200:
 *         description: Berhasil mengambil order berdasarkan tanggal
 *       500:
 *         description: Server error
 */
router.get("/date/:date", async (req, res) => {
  const { date } = req.params;
  const client = await pool.connect();
  try {
    const orders = await client.query(
      "SELECT * FROM orders WHERE DATE(order_date) = $1",
      [date]
    );

    const result = await Promise.all(
      orders.rows.map(async (order) => {
        const items = await getOrderItems(client, order.id);
        const total = items.reduce((sum, i) => sum + Number(i.subtotal), 0);
        return { ...order, items, total };
      })
    );

    res.status(200).json({
      status: "success",
      total: result.length,
      data: result,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
});

// =====================================================================
// GET /orders/customer/:customer_id
// Ambil semua order milik customer tertentu BESERTA item-itemnya
// Harus di atas GET /:id supaya tidak tertimpa
// =====================================================================
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
  const client = await pool.connect();
  try {
    const orders = await client.query(
      "SELECT * FROM orders WHERE customer_id = $1 ORDER BY id DESC",
      [customer_id]
    );

    const result = await Promise.all(
      orders.rows.map(async (order) => {
        const items = await getOrderItems(client, order.id);
        const total = items.reduce((sum, i) => sum + Number(i.subtotal), 0);
        return { ...order, items, total };
      })
    );

    res.status(200).json({
      status: "success",
      total: result.length,
      data: result,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
});

// =====================================================================
// GET /orders/:id
// Ambil 1 order BESERTA item-itemnya
// =====================================================================
/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: Ambil detail order beserta item produk
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
  const client = await pool.connect();
  try {
    // Ambil data order (MASTER)
    const orderResult = await client.query(
      "SELECT * FROM orders WHERE id = $1",
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Order tidak ditemukan",
      });
    }

    const order = orderResult.rows[0];

    // Ambil semua produk di order ini (DETAIL)
    const items = await getOrderItems(client, order.id);

    // Hitung total harga
    const total = items.reduce((sum, i) => sum + Number(i.subtotal), 0);

    res.status(200).json({
      status: "success",
      data: { ...order, items, total },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
});

// =====================================================================
// POST /orders
// Buat order baru SEKALIGUS isi produk-produknya
// Request body:
// {
//   "customer_id": 3,
//   "status": "pending",
//   "items": [
//     { "product_id": 1, "quantity": 2 },
//     { "product_id": 4, "quantity": 1 }
//   ]
// }
// =====================================================================
/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Buat order baru beserta item produk (master-detail)
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *               - items
 *             properties:
 *               customer_id:
 *                 type: integer
 *                 example: 3
 *               status:
 *                 type: string
 *                 example: "pending"
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product_id:
 *                       type: integer
 *                     quantity:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Order berhasil dibuat
 *       400:
 *         description: Data tidak lengkap atau stok habis
 *       500:
 *         description: Server error
 */
router.post("/", async (req, res) => {
  const { customer_id, status, items } = req.body;

  // Validasi input
  if (!customer_id || !items || items.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "customer_id dan items (minimal 1 produk) wajib diisi",
    });
  }

  // Ambil koneksi khusus untuk transaksi database
  const client = await pool.connect();

  try {
    // ── MULAI TRANSAKSI ──────────────────────────────────────
    await client.query("BEGIN");

    // LANGKAH 1: Buat order baru (MASTER)
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, status)
       VALUES ($1, $2)
       RETURNING *`,
      [customer_id, status || "pending"]
    );
    const order = orderResult.rows[0];

    // LANGKAH 2: Proses setiap item produk (DETAIL)
    const insertedItems = [];

    for (const item of items) {
      // Cek apakah produk ada di database
      const produkResult = await client.query(
        "SELECT id, name, price, stock FROM products WHERE id = $1",
        [item.product_id]
      );

      if (produkResult.rows.length === 0) {
        // Produk tidak ditemukan → lempar error → ROLLBACK
        throw new Error(`Produk dengan ID ${item.product_id} tidak ditemukan`);
      }

      const produk = produkResult.rows[0];

      // Cek apakah stok cukup
      if (produk.stock < item.quantity) {
        // Stok tidak cukup → lempar error → ROLLBACK
        throw new Error(
          `Stok produk "${produk.name}" tidak cukup. Stok tersedia: ${produk.stock}`
        );
      }

      // Masukkan item ke tabel order_products (DETAIL)
      const detailResult = await client.query(
        `INSERT INTO order_products (order_id, product_id, quantity)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [order.id, item.product_id, item.quantity]
      );

      // Kurangi stok produk
      await client.query(
        "UPDATE products SET stock = stock - $1 WHERE id = $2",
        [item.quantity, item.product_id]
      );

      // Simpan item beserta nama dan harga untuk response
      insertedItems.push({
        ...detailResult.rows[0],
        product_name: produk.name,
        price: produk.price,
        subtotal: produk.price * item.quantity,
      });
    }

    // LANGKAH 3: Hitung total harga
    const total = insertedItems.reduce((sum, i) => sum + i.subtotal, 0);

    // ── SIMPAN SEMUA (semua langkah berhasil) ────────────────
    await client.query("COMMIT");

    res.status(201).json({
      status: "success",
      message: "Order berhasil dibuat",
      data: { ...order, items: insertedItems, total },
    });
  } catch (err) {
    // ── BATALKAN SEMUA (ada yang gagal) ─────────────────────
    await client.query("ROLLBACK");
    res.status(400).json({ status: "error", message: err.message });
  } finally {
    // Kembalikan koneksi ke pool (wajib selalu dijalankan)
    client.release();
  }
});

// =====================================================================
// PUT /orders/:id
// Update status order + ganti item-itemnya sekaligus
//
// Request body:
// {
//   "customer_id": 3,
//   "status": "processing",
//   "items": [
//     { "product_id": 1, "quantity": 3 },
//     { "product_id": 5, "quantity": 2 }
//   ]
// }
// =====================================================================
/**
 * @swagger
 * /orders/{id}:
 *   put:
 *     summary: Update order beserta item produk (master-detail)
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
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product_id:
 *                       type: integer
 *                     quantity:
 *                       type: integer
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
  const { customer_id, status, items } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Cek order ada
    const cekOrder = await client.query(
      "SELECT * FROM orders WHERE id = $1",
      [id]
    );
    if (cekOrder.rows.length === 0) {
      throw new Error("Order tidak ditemukan");
    }

    // LANGKAH 1: Update data order (MASTER)
    const orderResult = await client.query(
      `UPDATE orders
       SET customer_id = $1, status = $2
       WHERE id = $3
       RETURNING *`,
      [customer_id, status, id]
    );

    let updatedItems = [];

    // LANGKAH 2: Kalau ada items baru, ganti semua item lama
    if (items && items.length > 0) {

      // Kembalikan stok dari item lama dulu
      const itemLama = await client.query(
        "SELECT product_id, quantity FROM order_products WHERE order_id = $1",
        [id]
      );
      for (const item of itemLama.rows) {
        await client.query(
          "UPDATE products SET stock = stock + $1 WHERE id = $2",
          [item.quantity, item.product_id]
        );
      }

      // Hapus semua item lama
      await client.query(
        "DELETE FROM order_products WHERE order_id = $1",
        [id]
      );

      // Masukkan item baru
      for (const item of items) {
        const produkResult = await client.query(
          "SELECT id, name, price, stock FROM products WHERE id = $1",
          [item.product_id]
        );

        if (produkResult.rows.length === 0) {
          throw new Error(`Produk ID ${item.product_id} tidak ditemukan`);
        }

        const produk = produkResult.rows[0];

        if (produk.stock < item.quantity) {
          throw new Error(
            `Stok produk "${produk.name}" tidak cukup. Tersedia: ${produk.stock}`
          );
        }

        const detailResult = await client.query(
          `INSERT INTO order_products (order_id, product_id, quantity)
           VALUES ($1, $2, $3) RETURNING *`,
          [id, item.product_id, item.quantity]
        );

        await client.query(
          "UPDATE products SET stock = stock - $1 WHERE id = $2",
          [item.quantity, item.product_id]
        );

        updatedItems.push({
          ...detailResult.rows[0],
          product_name: produk.name,
          price: produk.price,
          subtotal: produk.price * item.quantity,
        });
      }
    } else {
      // Tidak ada items baru → ambil item yang sudah ada
      updatedItems = await getOrderItems(client, id);
    }

    const total = updatedItems.reduce((sum, i) => sum + Number(i.subtotal), 0);

    await client.query("COMMIT");

    res.status(200).json({
      status: "success",
      message: "Order berhasil diperbarui",
      data: { ...orderResult.rows[0], items: updatedItems, total },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
});

// =====================================================================
// DELETE /orders/:id
// Hapus order BESERTA semua item-nya, stok produk dikembalikan
// =====================================================================
/**
 * @swagger
 * /orders/{id}:
 *   delete:
 *     summary: Hapus order beserta semua item (stok dikembalikan)
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Cek order ada
    const cekOrder = await client.query(
      "SELECT * FROM orders WHERE id = $1",
      [id]
    );
    if (cekOrder.rows.length === 0) {
      throw new Error("Order tidak ditemukan");
    }

    // LANGKAH 1: Kembalikan stok produk dari semua item order ini
    const items = await client.query(
      "SELECT product_id, quantity FROM order_products WHERE order_id = $1",
      [id]
    );
    for (const item of items.rows) {
      await client.query(
        "UPDATE products SET stock = stock + $1 WHERE id = $2",
        [item.quantity, item.product_id]
      );
    }

    // LANGKAH 2: Hapus semua item (DETAIL) dulu
    await client.query(
      "DELETE FROM order_products WHERE order_id = $1",
      [id]
    );

    // LANGKAH 3: Baru hapus order (MASTER)
    const result = await client.query(
      "DELETE FROM orders WHERE id = $1 RETURNING *",
      [id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      status: "success",
      message: "Order berhasil dihapus dan stok produk dikembalikan",
      data: result.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;






