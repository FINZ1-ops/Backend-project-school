// generate_hash.js
// Jalankan: node generate_hash.js
// Taruh file ini di folder backend kamu (yang ada node_modules/bcrypt)

const bcrypt = require("bcrypt");

async function main() {
  const password = "Admin123!";
  const hash = await bcrypt.hash(password, 12);

  console.log("=".repeat(60));
  console.log("Password :", password);
  console.log("Hash     :", hash);
  console.log("=".repeat(60));
  console.log("\nCopy hash di atas, lalu jalankan SQL berikut:");
  console.log(`\nUPDATE public.users SET password = '${hash}' WHERE email = 'admin@fashionstore.com';\n`);
}

main();
