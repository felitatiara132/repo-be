// node create-superadmin.js
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const DB = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '301004',
  database: 'repository',
};

const EMAIL    = 'superadmin@repository.com';
const PASSWORD = 'SuperAdmin123!';
const NAME     = 'Super Admin';

(async () => {
  const client = new Client(DB);
  await client.connect();

  // Cari role 'super admin'
  const roleRes = await client.query(`SELECT id FROM roles WHERE name ILIKE 'super admin' LIMIT 1`);
  if (roleRes.rows.length === 0) {
    console.error('Role "super admin" tidak ditemukan di tabel roles!');
    await client.end();
    process.exit(1);
  }
  const roleId = roleRes.rows[0].id;
  console.log(`Role super admin ID: ${roleId}`);

  // Cek apakah email sudah ada
  const existing = await client.query(`SELECT id FROM users WHERE email = $1`, [EMAIL]);
  if (existing.rows.length > 0) {
    console.log(`User ${EMAIL} sudah ada (ID: ${existing.rows[0].id}). Tidak perlu insert ulang.`);
    await client.end();
    return;
  }

  // Hash password
  const hashed = await bcrypt.hash(PASSWORD, 10);

  // Insert user
  const insert = await client.query(
    `INSERT INTO users (id, email, password, name, role_id, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
     RETURNING id`,
    [EMAIL, hashed, NAME, roleId],
  );

  console.log(`\nUser berhasil dibuat!`);
  console.log(`  ID    : ${insert.rows[0].id}`);
  console.log(`  Email : ${EMAIL}`);
  console.log(`  Pass  : ${PASSWORD}`);
  console.log(`  Role  : super admin`);

  await client.end();
})().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
