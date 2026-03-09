const pool = require("../db/pool");

module.exports = function verifyRole(allowedRoles = []) {
  return async function (req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          status: "error",
          message: "User tidak valid"
        });
      }

      const result = await pool.query(
        "SELECT role, _is_active_disabled FROM users WHERE id = $1",
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "User tidak ditemukan"
        });
      }

      const user = result.rows[0];

      // Cek banned — berlaku untuk semua role dan semua method
      if (user._is_active_disabled === true) {
        return res.status(403).json({
          status: "error",
          message: "Akun Anda telah dinonaktifkan"
        });
      }

      // Kalau method GET → semua role yang sudah login boleh akses
      if (req.method === "GET") {
        return next();
      }

      // Kalau POST / PUT / DELETE → cek role
      if (!allowedRoles.includes(user.role.toLowerCase())) {
        return res.status(403).json({
          status: "error",
          message: `Akses ditolak: role '${user.role}' tidak memiliki izin`
        });
      }

      next();

    } catch (err) {
      console.error("verifyRole error:", err.message);
      return res.status(500).json({
        status: "error",
        message: "Internal server error"
      });
    }
  };
};