// node seed-roles.js
// Menyesuaikan nama role di DB agar cocok dengan RolesGuard
const { Client } = require('pg');

const DB = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '301004',
  database: 'repository',
};

(async () => {
  const client = new Client(DB);
  await client.connect();

  // 1. Rename 'Super Admin' → 'super admin' (agar cocok dengan guard bypass)
  await client.query(`UPDATE roles SET name = 'super admin' WHERE name = 'Super Admin'`);
  console.log("Role 'Super Admin' → 'super admin'");

  // 2. Buat role 'admin' jika belum ada (dipakai oleh @Roles('admin'))
  const existing = await client.query(`SELECT id FROM roles WHERE name = 'admin'`);
  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO roles (id, name, description, created_at, updated_at)
       VALUES (gen_random_uuid(), 'admin', 'Administrator', NOW(), NOW())`
    );
    console.log("Role 'admin' dibuat");
  } else {
    console.log("Role 'admin' sudah ada");
  }

  // Tampilkan semua role setelah seeding
  const all = await client.query(`SELECT id, name FROM roles ORDER BY name`);
  console.log('\nRoles sekarang:');
  all.rows.forEach(r => console.log(`  ${r.name}  (${r.id})`));

  await client.end();
})().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
