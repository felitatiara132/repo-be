import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../entities';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
  ) {}

  async findAll(): Promise<Role[]> {
    return this.roleRepository.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async findByName(name: string): Promise<Role | null> {
    return this.roleRepository.findOne({ where: { name } });
  }

  async create(data: {
    name: string;
    description?: string;
    is_admin?: boolean;
    category?: string;
    color?: string;
    max_folder_depth?: number | null;
  }): Promise<Role> {
    const existing = await this.findByName(data.name.trim());
    if (existing) throw new ConflictException(`Role "${data.name}" sudah ada`);

    const role = this.roleRepository.create({
      name: data.name.trim(),
      description: data.description?.trim() || undefined,
      is_active: true,
      is_system: false,
    });

    const saved = await this.roleRepository.save(role);
    return this.findOne(saved.id);
  }

  async update(id: string, data: Partial<{
    name: string;
    description: string;
    is_active: boolean;
    max_folder_depth: number | null;
  }>): Promise<Role> {
    const role = await this.findOne(id);

    if (data.name && data.name !== role.name) {
      const existing = await this.findByName(data.name.trim());
      if (existing) throw new ConflictException(`Role "${data.name}" sudah ada`);
      role.name = data.name.trim();
    }

    if (data.description !== undefined) role.description = data.description;
    if (data.is_active !== undefined) role.is_active = data.is_active;
    if (data.max_folder_depth !== undefined) role.max_folder_depth = data.max_folder_depth;

    return this.roleRepository.save(role);
  }

  async delete(id: string): Promise<void> {
    const role = await this.findOne(id);
    if (role.is_system) throw new BadRequestException('Role sistem tidak dapat dihapus');
    await this.roleRepository.remove(role);
  }

  async toggleActive(id: string): Promise<Role> {
    const role = await this.findOne(id);
    if (role.is_system) throw new BadRequestException('Role sistem tidak dapat dinonaktifkan');
    role.is_active = !role.is_active;
    return this.roleRepository.save(role);
  }

  async updateRoleDepth(roleIds: string[], maxDepth: number): Promise<void> {
    if (roleIds.length === 0) return;
    await this.roleRepository.update(roleIds, { max_folder_depth: maxDepth });
  }
}
