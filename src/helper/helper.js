const jwt = require("jsonwebtoken");

const ACCESS_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// ===============================
//   ACCESS TOKEN (User Biasa)
// ===============================
function generateAccessToken(payload) {
  return jwt.sign(
    {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    },
    ACCESS_SECRET,
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRATION, // contoh: "1h"
    }
  );
}

// ===============================
//   ACCESS TOKEN ADMIN (Tidak Expired)
// ===============================
function generateAdminToken(payload) {
  return jwt.sign(
    {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    },
    ACCESS_SECRET // tanpa expiresIn → tidak akan expired
  );
}

// ===============================
//   REFRESH TOKEN (tidak pakai role)
// ===============================
function generateRefreshToken(payload) {
  return jwt.sign(
    {
      id: payload.id, // refresh token cukup ID
    },
    REFRESH_SECRET,
    {
      expiresIn: "7d",
    }
  );
}

// ===============================
//   VERIFY FUNCTION
// ===============================
function verifyToken(token, secret = ACCESS_SECRET) {
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

module.exports = {
  generateAccessToken,
  generateAdminToken,
  generateRefreshToken,
  verifyToken,
};
