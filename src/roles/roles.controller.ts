import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async findAll() {
    return this.rolesService.findAll();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async create(@Body() body: {
    name: string;
    description?: string;
    max_folder_depth?: number | null;
  }) {
    return this.rolesService.create(body);
  }

  @Patch('depth')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async updateDepth(@Body() body: { roleIds: string[]; maxDepth: number }) {
    await this.rolesService.updateRoleDepth(body.roleIds, body.maxDepth);
    return { success: true, message: `Max depth updated for ${body.roleIds.length} roles` };
  }

  @Patch(':id/toggle-active')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async toggleActive(@Param('id') id: string) {
    return this.rolesService.toggleActive(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<{
      name: string;
      description: string;
      is_active: boolean;
      max_folder_depth: number | null;
    }>,
  ) {
    return this.rolesService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.rolesService.delete(id);
  }
}
