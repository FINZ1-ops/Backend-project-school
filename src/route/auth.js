const express = require("express");
const jwt = require("jsonwebtoken");
const { hash, compare } = require("bcrypt");
const pool = require("../db/pool");
const { generateAccessToken, generateRefreshToken } = require("../helper/helper");

const router = express.Router();

// REGISTER
/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register user baru
 *     tags: [Auth]
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
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *             required:
 *               - fullname
 *               - username
 *               - email
 *               - password
 *               - role
 *     responses:
 *       201:
 *         description: Akun berhasil dibuat
 *       400:
 *         description: Email atau username sudah digunakan
 *       500:
 *         description: Internal server error
 */

router.post("/register", async (req, res) => {
  const { fullname, username, email, password, role } = req.body;

  const ALLOWED_ROLES = ["admin", "cashier","user"];
    if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ status: "error", message: 'Role hanya boleh "admin", "cashier", atau "user"' });
  }

  if (!fullname || !username || !email || !password || !role) {
    return res.status(400).json({
      status: "error",
      message: "Semua field wajib diisi"
    });
  }

  try {
    const check = await pool.query(
      "SELECT * FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );

    if (check.rowCount > 0) {
      return res.status(400).json({
        status: "failed",
        message: "Email atau username sudah dipakai"
      });
    }

    const hashedPassword = await hash(password, 12);

    const insert = await pool.query(
      `INSERT INTO users (fullname, username, email, password, role) 
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, fullname, username, email, role`,
      [fullname, username, email, hashedPassword, role]
    );

    res.status(201).json({
      status: "success",
      message: "Akun berhasil dibuat",
      data: insert.rows[0]
    });

  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// LOGIN
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login berhasil
 *       400:
 *         description: Email atau password salah
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rowCount === 0) {
      return res.status(400).json({ status: "error", message: "Email tidak ditemukan" });
    }

    const user = result.rows[0];
    const match = await compare(password, user.password);

    if (!match) {
      return res.status(400).json({ status: "error", message: "Password salah" });
    }

    // TOKEN: admin tidak expired
    let accessToken;
    if (user.role.toLowerCase() === "admin") {
      accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET
      );
    } else {
      accessToken = generateAccessToken({
        id: user.id,
        email: user.email,
        role: user.role
      });
    }

    

    const refreshToken = generateRefreshToken({ id: user.id });

    // Reset token lama
    await pool.query("DELETE FROM tokens WHERE user_id = $1", [user.id]);

    await pool.query(
      `INSERT INTO tokens (user_id, token, refresh_token, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [user.id, accessToken, refreshToken]
    );

    res.status(200).json({
      status: "success",
      message: "Login berhasil",
      data: {
        id: user.id,
        fullname: user.fullname,
        email: user.email,
        role: user.role
      },
      accessToken,
      refreshToken
    });

  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Internal server error: " + err.message
    });
  }
});

// LOGOUT
router.post("/logout", async (req, res) => {
  try {
    // Ambil token dari header untuk mencari user_id
    let token = req.headers["authorization"];
    if (token && token.startsWith("Bearer ")) {
      token = token.slice(7);
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        await pool.query("DELETE FROM tokens WHERE user_id = $1", [decoded.id]);
      } catch {
        // Token invalid/expired - tetap anggap logout berhasil
      }
    }

    res.status(200).json({
      status: "success",
      message: "Berhasil logout"
    });

  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;
