const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const verifyRole = require("../middleware/verifyRole");

// GET semua user
/**
 * @swagger
 * /users:
 *   get:
 *     summary: Ambil semua users
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Berhasil mengambil list user
 */

router.get("/", verifyRole(["admin","cashier"]), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, fullname, username, email, phone, address, role, _is_active_disabled FROM users ORDER BY id ASC"
    );
    res.json({ status: "success", count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// GET user by ID
/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Ambil detail user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User ditemukan
 *       404:
 *         description: User tidak ditemukan
 */
router.get("/:id", verifyRole(["admin","cashier"]), async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT id, fullname, username, email, phone, address, role, _is_active_disabled
       FROM users WHERE id = $1`,
      [id]
    );

    if (rows.length === 0)
      return res.status(404).json({ status: "error", message: "User tidak ditemukan" });

    res.json({ status: "success", data: rows[0] });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// PUT 
/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update data user
 *     tags: [Users]
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
 *               fullname:
 *                 type: string
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *               _is_active_disabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User berhasil diupdate
 */

router.put("/:id", verifyRole(["admin"]), async (req, res) => {
  const { id } = req.params;
  const { fullname, username, email, role, _is_active_disabled } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users
       SET fullname = COALESCE($1, fullname),
           username = COALESCE($2, username),
           email = COALESCE($3, email),
           role = COALESCE($4, role),
           _is_active_disabled = COALESCE($5, _is_active_disabled)
       WHERE id = $6
       RETURNING id, fullname, username, email, role, _is_active_disabled`,
      [fullname, username, email, role, _is_active_disabled, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "User tidak ditemukan"
      });
    }

    res.json({
      status: "success",
      message: "User berhasil diperbarui",
      data: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message
    });
  }
});

//Delete user
/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Hapus user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User berhasil dihapus
 */

router.delete("/:id", verifyRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING id, fullname, email",
      [id]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ status: "error", message: "User tidak ditemukan" });

    res.json({ status: "success", message: "User berhasil dihapus", data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;