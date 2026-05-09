import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, Role, UserRole } from '../entities';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FoldersService } from '../folders/folders.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(UserRole)
    private userRoleRepository: Repository<UserRole>,
    @InjectDataSource()
    private dataSource: DataSource,
    @Inject(forwardRef(() => FoldersService))
    private foldersService: FoldersService,
  ) {}

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['role', 'roles', 'roles.role'],
    });
    if (!user) throw new NotFoundException('User not found');
    return this.enrichUserRoles(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['role', 'roles', 'roles.role'],
    });
  }

  async findAll(page: number = 1, limit: number = 10) {
    const [users, total] = await this.userRepository.findAndCount({
      relations: ['role', 'roles', 'roles.role'],
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });

    // Pastikan setiap user punya role utama di daftar roles-nya
    const enriched = users.map(user => this.enrichUserRoles(user));

    return {
      data: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Pastikan role utama (users.role_id) selalu ada di user.roles
  private enrichUserRoles(user: User): User {
    if (!user.role) return user;

    const roles = user.roles ?? [];
    const hasPrimary = roles.some(ur => ur.role_id === user.role_id);

    if (!hasPrimary) {
      const primaryEntry = {
        id: `primary-${user.role_id}`,
        user_id: user.id,
        role_id: user.role_id,
        role: user.role,
        is_primary: true,
        assigned_at: user.created_at,
        expires_at: null,
      } as any;
      user.roles = [primaryEntry, ...roles];
    } else {
      // Pastikan entry primary punya is_primary = true
      user.roles = roles.map(ur => ({
        ...ur,
        is_primary: ur.role_id === user.role_id ? true : ur.is_primary,
      })) as any;
    }

    // Deduplicate by role_id
    const seen = new Set<string>();
    user.roles = user.roles.filter(ur => {
      if (seen.has(ur.role_id)) return false;
      seen.add(ur.role_id);
      return true;
    });

    return user;
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) throw new ConflictException('User with this email already exists');

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    let unit = 'general';
    if (createUserDto.role_id) {
      const role = await this.roleRepository.findOne({ where: { id: createUserDto.role_id } });
      if (role) unit = role.name.toLowerCase().substring(0, 50);
    }

    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
      unit,
    });

    const savedUser = await this.userRepository.save(user);
    return this.findOne(savedUser.id);
  }

  async importExcel(usersData: any[]): Promise<{ success: number; failed: number; errors: any[] }> {
    let success = 0;
    let failed = 0;
    const errors: any[] = [];
    const roles = await this.roleRepository.find();

    for (const data of usersData) {
      if (!data.name || !data.email) {
        failed++;
        errors.push({ email: data.email || 'Unknown', error: 'Missing name or email' });
        continue;
      }
      try {
        const existingUser = await this.findByEmail(data.email);
        if (existingUser) {
          failed++;
          errors.push({ email: data.email, error: 'User already exists' });
          continue;
        }
        const role = roles.find(r => r.name === (data.role || '').toLowerCase())
          || roles.find(r => r.name === 'tendik');

        await this.create({
          email: data.email,
          name: data.name,
          password: data.password || 'password123',
          role_id: role ? role.id : undefined,
        });
        success++;
      } catch (err) {
        failed++;
        errors.push({ email: data.email, error: err.message });
      }
    }
    return { success, failed, errors };
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.findByEmail(updateUserDto.email);
      if (existingUser) throw new ConflictException('User with this email already exists');
    }

    if (updateUserDto.role_id && updateUserDto.role_id !== user.role_id) {
      const newRole = await this.roleRepository.findOne({ where: { id: updateUserDto.role_id } });
      if (!newRole) throw new NotFoundException(`Role with id ${updateUserDto.role_id} not found`);
      user.role = newRole;
      user.role_id = updateUserDto.role_id;
      user.unit = newRole.name.toLowerCase().substring(0, 50);
    }

    const { role_id, ...otherFields } = updateUserDto;
    Object.assign(user, otherFields);
    await this.userRepository.save(user);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id); // pastikan user ada

    await this.dataSource.transaction(async (manager) => {
      // 1. Hapus access_requests yang melibatkan user ini
      await manager.query(
        `DELETE FROM access_requests WHERE "requesterId" = $1 OR "ownerId" = $1`,
        [id],
      );

      // 2. Hapus folder_permissions milik user ini
      await manager.query(
        `DELETE FROM folder_permissions WHERE user_id = $1`,
        [id],
      );

      // 3. Nullify folder owner (bukan dihapus, folder tetap ada)
      await manager.query(
        `UPDATE folders SET owner_id = NULL WHERE owner_id = $1`,
        [id],
      );

      // 4. Hapus multi-role assignments
      await manager.query(
        `DELETE FROM user_roles WHERE user_id = $1`,
        [id],
      );

      // 5. Hapus user
      await manager.query(`DELETE FROM users WHERE id = $1`, [id]);
    });
  }

  // ─── Multi-Role ──────────────────────────────────────────────────────────

  private async buildRoleList(user: User): Promise<UserRole[]> {
    const rows = await this.userRoleRepository.find({
      where: { user_id: user.id },
      relations: ['role'],
      order: { assigned_at: 'ASC' },
    });

    // Deduplicate by role_id — hanya satu entry per role
    const roleMap = new Map<string, UserRole>();
    for (const ur of rows) {
      if (!roleMap.has(ur.role_id)) {
        roleMap.set(ur.role_id, ur);
      }
    }

    // Pastikan role utama (users.role_id) selalu ada dan is_primary = true
    if (user.role) {
      const existing = roleMap.get(user.role_id);
      if (existing) {
        roleMap.set(user.role_id, { ...existing, is_primary: true });
      } else {
        roleMap.set(user.role_id, {
          id: `primary-${user.role_id}`,
          user_id: user.id,
          role_id: user.role_id,
          role: user.role,
          is_primary: true,
          assigned_at: user.created_at,
          expires_at: null,
        } as UserRole);
      }
    }

    // Susun: primary di depan, sisanya is_primary = false
    const result: UserRole[] = [];
    const primary = roleMap.get(user.role_id);
    if (primary) result.push(primary);

    for (const [roleId, ur] of roleMap) {
      if (roleId !== user.role_id) {
        result.push({ ...ur, is_primary: false });
      }
    }

    return result;
  }

  async getMyRoles(userId: string): Promise<UserRole[]> {
    const user = await this.findOne(userId);
    return this.buildRoleList(user);
  }

  async getUserRoles(userId: string): Promise<UserRole[]> {
    const user = await this.findOne(userId);
    return this.buildRoleList(user);
  }

  async assignRole(
    userId: string,
    roleId: string,
    options: { is_primary?: boolean; expires_at?: string | null } = {},
  ): Promise<UserRole> {
    await this.findOne(userId);

    const role = await this.roleRepository.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    const existing = await this.userRoleRepository.findOne({
      where: { user_id: userId, role_id: roleId },
    });
    if (existing) throw new ConflictException('User sudah memiliki role ini');

    const userRole = this.userRoleRepository.create({
      user_id: userId,
      role_id: roleId,
      is_primary: options.is_primary ?? false,
      expires_at: options.expires_at ? new Date(options.expires_at) : null,
    });

    const saved = await this.userRoleRepository.save(userRole);
    const result = await this.userRoleRepository.findOne({
      where: { id: saved.id },
      relations: ['role'],
    });
    if (!result) throw new NotFoundException('UserRole not found after save');
    return result;
  }

  async removeRole(userId: string, roleId: string): Promise<void> {
    const userRole = await this.userRoleRepository.findOne({
      where: { user_id: userId, role_id: roleId },
    });
    if (!userRole) throw new NotFoundException('Assignment role tidak ditemukan');
    if (userRole.is_primary) throw new BadRequestException('Role default tidak dapat dihapus');
    await this.userRoleRepository.remove(userRole);
  }

  async switchRole(userId: string, roleId: string): Promise<{ user: User; active_role: Role }> {
    const user = await this.findOne(userId);
    const role = await this.roleRepository.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    // Pastikan user memiliki role tersebut (di user_roles atau sebagai role default)
    const hasRole = user.role_id === roleId
      || !!(await this.userRoleRepository.findOne({ where: { user_id: userId, role_id: roleId } }));

    if (!hasRole) throw new BadRequestException('User tidak memiliki role tersebut');

    return { user, active_role: role };
  }
}
