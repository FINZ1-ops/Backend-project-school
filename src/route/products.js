const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

const ALLOWED_TYPES = ['clothing', 'accessory'];

function validateProductInput(body) {
  const { name, price, size, color, category } = body;
  if (!name || !size || !color || !category || price == null) return 'Semua field wajib diisi';
  if (!ALLOWED_TYPES.includes(category)) return 'category harus "clothing" atau "accessory"';
  if (isNaN(price) || price < 0) return 'price harus angka valid dan tidak negatif';
  return null;
}

// GET semua produk
/**
 * @swagger
 * /products:
 *   get:
 *     summary: Ambil semua produk
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: available
 *         schema:
 *           type: boolean
 *         description: Filter produk berdasarkan ketersediaan
 *     responses:
 *       200:
 *         description: Berhasil mengambil list produk
 *       500:
 *         description: Server error
 */

router.get('/', async (req, res) => {
  const { available } = req.query;
  let q = `SELECT id, name, price, size, color, category, available FROM products`;
  const values = [];
  if (available === 'true') {
    q += ` WHERE available = $1`;
    values.push(true);
  }

  try {
    const { rows } = await pool.query(q, values);
    res.json({ count: rows.length, data: rows });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET produk berdasarkan ID
/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Ambil detail produk berdasarkan ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Produk ditemukan
 *       404:
 *         description: Produk tidak ditemukan
 *       500:
 *         description: Server error
 */

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Tambah produk baru
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               size:
 *                 type: string
 *               color:
 *                 type: string
 *               category:
 *                 type: string
 *             required:
 *               - id
 *               - name
 *               - price
 *               - size
 *               - color
 *               - category
 *     responses:
 *       201:
 *         description: Produk berhasil dibuat
 *       400:
 *         description: Input tidak valid
 *       500:
 *         description: Server error
 */


router.post('/', async (req, res) => {
  const err = validateProductInput(req.body);
  if (err) return res.status(400).json({ error: err });

  const { id, name, price, size, color, category } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE products IN SHARE ROW EXCLUSIVE MODE');

    const { rows: maxRows } = await client.query('SELECT COALESCE(MAX(id),0)+1 AS next_id FROM products');
    const nextId = maxRows[0].next_id;

    const { rows } = await client.query(
      `INSERT INTO products (id, name, price, size, color, category, available)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING *`,
      [nextId, name, price, size, color, category]
    );

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PUT update produk
/**
 * @swagger
 * /products/{id}:
 *   put:
 *     summary: Update produk berdasarkan ID
 *     tags: [Products]
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
 *               price:
 *                 type: number
 *               size:
 *                 type: string
 *               color:
 *                 type: string
 *               category:
 *                 type: string
 *               available:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Produk berhasil diperbarui
 *       404:
 *         description: Produk tidak ditemukan
 *       500:
 *         description: Server error
 */



router.put('/:id', async (req, res) => {
  const err = validateProductInput(req.body);
  if (err) return res.status(400).json({ error: err });

  const { name, price, size, color, category, available } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Produk tidak ditemukan' });

    const updateQuery = `
      UPDATE products
      SET name=$1, price=$2, size=$3, color=$4, category=$5, available=COALESCE($6, available)
      WHERE id=$7 RETURNING *`;
    const { rows } = await pool.query(updateQuery, [name, price, size, color, category, available, req.params.id]);
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE produk
/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Hapus produk berdasarkan ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Produk berhasil dihapus
 *       404:
 *         description: Produk tidak ditemukan
 *       500:
 *         description: Server error
 */

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Produk tidak ditemukan' });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
