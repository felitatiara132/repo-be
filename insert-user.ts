// Jalankan script ini dengan: npx ts-node insert-user.ts
// Pastikan sudah install bcryptjs dan ts-node

import { createConnection } from 'typeorm';
import * as bcrypt from 'bcryptjs';

(async () => {
  const connection = await createConnection();

  const email = 'superadmin@example.com';
  const plainPassword = 'SuperAdmin!2026'; // password bisa diganti sesuai kebutuhan
  const name = 'Super Admin';
  const role_id = 'b350b246-9723-4d48-a25b-901228c6845f'; // UUID role super admin

  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  await connection.query(
    `INSERT INTO users (id, email, password, name, role_id, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())`,
    [email, hashedPassword, name, role_id]
  );

  console.log('User berhasil ditambahkan!');
  await connection.close();
})();
