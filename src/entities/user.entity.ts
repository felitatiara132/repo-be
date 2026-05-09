import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Role } from './role.entity';
import { FolderPermission } from './folder-permission.entity';
import { Folder } from './folder.entity';
import { UserRole } from './user-role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, type: 'varchar', length: 255 })
  email: string;

  @Column()
  password: string;

  @Column()
  name: string;

  @Column({ type: 'uuid' })
  role_id: string;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role: Role;

  // Multi-role: semua role tambahan dari tabel user_roles
  @OneToMany(() => UserRole, (userRole) => userRole.user)
  roles: UserRole[];

  @Column({ type: 'varchar', length: 50, nullable: true, default: 'general' })
  unit: string;

  @OneToMany(() => FolderPermission, (permission) => permission.user)
  folderPermissions: FolderPermission[];

  @OneToMany(() => Folder, (folder) => folder.owner)
  ownedFolders: Folder[];

  @Column({ type: 'int', nullable: true })
  max_folder_depth: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
