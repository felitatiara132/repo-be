import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  async getProfile(@Request() req: RequestWithUser) {
    return this.usersService.findOne(req.user.id);
  }

  @Get('role')
  async getRole(@Request() req: RequestWithUser) {
    const user = await this.usersService.findOne(req.user.id);
    return { role: user.role, role_id: user.role_id };
  }

  // Harus di atas `:id` agar tidak dianggap parameter
  @Get('my-roles')
  async getMyRoles(@Request() req: RequestWithUser) {
    return this.usersService.getMyRoles(req.user.id);
  }

  @Post('switch-role')
  async switchRole(
    @Request() req: RequestWithUser,
    @Body() body: { role_id: string },
  ) {
    return this.usersService.switchRole(req.user.id, body.role_id);
  }

  @Get()
  async findAll(@Query() paginationDto: PaginationDto) {
    return this.usersService.findAll(paginationDto.page, paginationDto.limit);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Post('import-excel')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async importExcel(@Body() usersData: any[]) {
    return this.usersService.importExcel(usersData);
  }

  // ─── Multi-Role endpoints ───────────────────────────────────────────────

  @Get(':id/roles')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async getUserRoles(@Param('id') id: string) {
    return this.usersService.getUserRoles(id);
  }

  @Post(':id/roles')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async assignRole(
    @Param('id') id: string,
    @Body() body: { role_id: string; is_primary?: boolean; expires_at?: string | null },
  ) {
    return this.usersService.assignRole(id, body.role_id, {
      is_primary: body.is_primary,
      expires_at: body.expires_at,
    });
  }

  @Delete(':id/roles/:roleId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    await this.usersService.removeRole(id, roleId);
  }

  // ─── Standard CRUD ──────────────────────────────────────────────────────

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
    return { message: 'User deleted successfully' };
  }
}
