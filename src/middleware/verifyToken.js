const jwt = require("jsonwebtoken");

module.exports = async function verifyToken(req, res, next) {
  try {
    let token = req.headers["authorization"];

    if (!token) {
      return res.status(401).json({
        status: "error",
        message: "Token tidak ditemukan atau belum login"
      });
    }

    if (token.startsWith("Bearer ")) {
      token = token.slice(7);
    }

    // Verifikasi token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Tambahkan user ke request
    req.user = {
      id: decoded.id,
      role: decoded.role
    };

    next();

  } catch (err) {
    console.error("verifyToken Error:", err.message);

    if (err.message === "jwt expired") {
      return res.status(401).json({
        status: "error",
        message: "Token kadaluarsa, silakan login ulang"
      });
    }

    return res.status(401).json({
      status: "error",
      message: "Token invalid: " + err.message
    });
  }
};
