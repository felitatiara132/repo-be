import { Controller, Get, Query, Param, Res, Headers, ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { FilesService } from '../files/files.service';
import { FoldersService } from '../folders/folders.service';
import { UsersService } from '../users/users.service';
import { Public } from '../common/decorators/public.decorator';

/** Map singkatan jenis ke label folder lengkap */
const JENIS_LABEL_MAP: Record<string, string> = {
  IKU: 'Indikator Kinerja Utama',
  PK: 'Perjanjian Kerja',
  'indikator kinerja utama': 'Indikator Kinerja Utama',
  'perjanjian kerja': 'Perjanjian Kerja',
};

function resolveJenisLabel(jenis: string): string {
  if (!jenis) return '';
  const key = jenis.trim().toUpperCase();
  return JENIS_LABEL_MAP[key] || JENIS_LABEL_MAP[jenis.trim().toLowerCase()] || jenis.trim();
}

@Controller('integration')
@Public()
export class IntegrationController {
  constructor(
    private readonly filesService: FilesService,
    private readonly foldersService: FoldersService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * GET /api/integration/files/unrestricted
   *
   * Endpoint khusus untuk ikupk-be (server-to-server).
   * Mengembalikan SEMUA file dalam folder indikator tanpa filter permission repository.
   * Akses dikontrol melalui header x-integration-secret — permission repository tetap
   * berlaku untuk semua akses user biasa di luar jalur ini.
   *
   * Harus dipanggil dengan header: x-integration-secret: <INTEGRATION_SECRET>
   */
  @Get('files/unrestricted')
  async getUnrestrictedFiles(
    @Headers('x-integration-secret') secret: string,
    @Query('jenis') jenis: string,
    @Query('kode') kode: string,
    @Query('nama') nama: string,
  ) {
    const expectedSecret = this.configService.get<string>('INTEGRATION_SECRET');
    if (!expectedSecret || secret !== expectedSecret) {
      throw new ForbiddenException('Invalid integration secret');
    }
    if (!jenis || !kode) return [];
    const jenisLabel = resolveJenisLabel(jenis);
    return this.filesService.findFilesByJenisKodeAndEmail(jenisLabel, kode, nama || kode, undefined);
  }

  /**
   * GET /api/integration/files/search
   *
   * Mode baru (hierarkis): ?jenis=IKU&kode=1.1.1&nama=Lulusan+Tepat+Waktu&email=xxx
   *   → Cari folder "Indikator Kinerja Utama" → sub-folder "1.1.1 Lulusan Tepat Waktu" → files
   *
   * Mode lama (legacy): ?name=1.1.1&email=xxx
   *   → Cari semua folder yang namanya mengandung "1.1.1" → files
   */
  @Get('files/search')
  async search(
    @Query('jenis') jenis: string,
    @Query('kode') kode: string,
    @Query('nama') nama: string,
    @Query('name') name: string,    // legacy param
    @Query('email') email?: string,
  ) {
    // Mode baru: hierarkis berdasarkan jenis + kode + nama
    if (jenis && kode) {
      const jenisLabel = resolveJenisLabel(jenis);
      const indikatorNama = nama || kode;
      return this.filesService.findFilesByJenisKodeAndEmail(jenisLabel, kode, indikatorNama, email);
    }

    // Mode lama: fallback via name saja
    if (!name) return [];
    return this.filesService.findFilesByFolderNameAndUserEmail(name, email);
  }

  @Get('folders')
  async getFolders(@Query('email') email: string) {
    if (!email) return [];
    const user = await this.usersService.findByEmail(email);
    if (!user) return [];
    return this.foldersService.findAllAccessible(user);
  }

  @Get('files')
  async getFilesByFolder(
    @Query('folderId') folderId: string,
    @Query('email') email: string,
  ) {
    if (!folderId || !email) return [];
    const user = await this.usersService.findByEmail(email);
    if (!user) return [];

    const hasPermission = await this.foldersService.checkPermission(
      user.id,
      user.role_id,
      folderId,
      'read',
    );
    if (!hasPermission) return [];

    return this.filesService.findAll(folderId, user);
  }

  /**
   * GET /api/integration/files/in-children
   * Mengambil semua file dari sub-folder langsung (level-2) dari folder yang dipilih.
   * Digunakan untuk mengambil file dari level-2 children ketika user klik Input File di level-1.
   */
  @Get('files/in-children')
  async getFilesInChildren(
    @Query('parentFolderId') parentFolderId: string,
    @Query('email') email: string,
  ) {
    if (!parentFolderId || !email) return [];
    return this.filesService.findFilesInChildFolders(parentFolderId, email);
  }

  /**
   * GET /api/integration/debug
   * Diagnosis: apakah folder & file ditemukan untuk kombinasi jenis+kode+email.
   * Contoh: /api/integration/debug?jenis=IKU&kode=1.1&email=user@example.com
   */
  @Get('debug')
  async debug(
    @Query('jenis') jenis: string,
    @Query('kode') kode: string,
    @Query('email') email?: string,
  ) {
    if (!jenis || !kode) {
      return { error: 'Parameter jenis dan kode wajib diisi. Contoh: ?jenis=IKU&kode=1.1&email=xxx@xxx.com' };
    }
    const jenisLabel = resolveJenisLabel(jenis);
    return this.filesService.debugSearchByJenisKode(jenisLabel, kode, email);
  }

  /**
   * GET /api/integration/preview/:fileId
   *
   * Serve file secara langsung tanpa autentikasi — diakses oleh browser dari ikupk frontend.
   * Aman karena file ID berupa UUID yang tidak bisa ditebak. Hanya untuk internal/LAN.
   */
  @Get('preview/:fileId')
  async previewFile(
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const file = await this.filesService.findByIdPublic(fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (!fs.existsSync(file.path)) return res.status(404).json({ error: 'File not on disk' });

    const stat = fs.statSync(file.path);
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': file.mime_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
    });
    fs.createReadStream(file.path).pipe(res);
  }

  /**
   * GET /api/integration/download/:fileId
   *
   * Force-download file tanpa autentikasi — untuk ikupk frontend.
   */
  @Get('download/:fileId')
  async downloadFile(
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const file = await this.filesService.findByIdPublic(fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (!fs.existsSync(file.path)) return res.status(404).json({ error: 'File not on disk' });

    res.download(file.path, file.name);
  }
}
