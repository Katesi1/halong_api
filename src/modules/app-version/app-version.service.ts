import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateVersionDto } from './dto/update-version.dto';
import { Messages } from '../../i18n';

@Injectable()
export class AppVersionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Public endpoint trả version metadata cho FE force-update check.
   * Không return 4xx khi không có data — trả null để FE coi như upToDate.
   */
  async getVersion(platform: string | undefined, _currentVersion: string | undefined, msg: Messages) {
    const target = (platform === 'ios' || platform === 'android') ? platform : null;

    if (!target) {
      // Không xác định platform → trả cả 2
      const all = await this.prisma.appVersion.findMany();
      const byPlatform: Record<string, any> = {};
      all.forEach((v) => {
        byPlatform[v.platform] = {
          latestVersion: v.latestVersion,
          minSupportedVersion: v.minSupportedVersion,
          releaseNotes: v.releaseNotes,
          storeUrl: v.storeUrl,
        };
      });
      return { message: msg.appVersion.success, data: byPlatform };
    }

    const row = await this.prisma.appVersion.findUnique({ where: { platform: target } });
    return {
      message: msg.appVersion.success,
      data: row
        ? {
            latestVersion: row.latestVersion,
            minSupportedVersion: row.minSupportedVersion,
            releaseNotes: row.releaseNotes,
            storeUrl: {
              ios: target === 'ios' ? row.storeUrl : null,
              android: target === 'android' ? row.storeUrl : null,
            },
          }
        : { latestVersion: null, minSupportedVersion: null, releaseNotes: null, storeUrl: null },
    };
  }

  /**
   * Admin upsert version (chỉ ADMIN gọi, qua /admin/app-version).
   */
  async upsertVersion(dto: UpdateVersionDto, msg: Messages) {
    const row = await this.prisma.appVersion.upsert({
      where: { platform: dto.platform },
      create: {
        platform: dto.platform,
        latestVersion: dto.latestVersion,
        minSupportedVersion: dto.minSupportedVersion,
        releaseNotes: dto.releaseNotes || null,
        storeUrl: dto.storeUrl,
      },
      update: {
        latestVersion: dto.latestVersion,
        minSupportedVersion: dto.minSupportedVersion,
        releaseNotes: dto.releaseNotes || null,
        storeUrl: dto.storeUrl,
      },
    });
    return { message: msg.appVersion.updateSuccess, data: row };
  }
}
