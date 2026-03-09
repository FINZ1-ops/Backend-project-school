const express = require("express");
const cors = require("cors");
const pool = require("./db/pool");
const verifyToken = require("./middleware/verifyToken");
const swaggerDocs = require("./swagger");

// Routers
const authRouter         = require("./route/auth");
const categoriesRouter   = require("./route/categories");
const productsRouter     = require("./route/products");
const stocksRouter       = require("./route/stocks");
const transactionsRouter = require("./route/transactions");
const ordersRouter       = require("./route/orders");
const usersRouter        = require("./route/users");

const app = express();

// Middleware
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:4173"],
  credentials: true,
}));
app.use(express.json());

// Auth — tidak perlu token
app.use("/auth", authRouter);
swaggerDocs(app);

// Semua route wajib login (verifyToken)
// Role check sudah dipasang di dalam masing-masing router
app.use("/categories",   verifyToken, categoriesRouter);
app.use("/products",     verifyToken, productsRouter);
app.use("/users",        verifyToken, usersRouter);
app.use("/transactions", verifyToken, transactionsRouter);
app.use("/orders",       verifyToken, ordersRouter);
app.use("/stocks",       verifyToken, stocksRouter);

app.get("/", (_req, res) => {
  res.json({ message: "API Toko Online ready ✦" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Endpoint tidak ditemukan" });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("Unexpected error:", err);
  res.status(500).json({ status: "error", message: "Terjadi kesalahan pada server" });
});

const PORT = process.env.APP_PORT || 3000;

pool.connect()
  .then(() => {
    console.log("✅ Database connected successfully");
    app.listen(PORT, () =>
      console.log(`✦  Server running at http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("❌ Failed to connect to database:", err.message);
    process.exit(1);
  });