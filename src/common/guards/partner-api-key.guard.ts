import {
  Injectable, CanActivate, ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getMessages } from '../../i18n';

@Injectable()
export class PartnerApiKeyGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const msg = getMessages(request.headers?.['accept-language']);
    const apiKey = request.headers['x-partner-key'];

    if (!apiKey) {
      throw new UnauthorizedException(msg.apiKey.missing);
    }

    const partner = await this.prisma.partnerKey.findUnique({
      where: { apiKey },
    });

    if (!partner || !partner.isActive) {
      throw new UnauthorizedException(msg.apiKey.invalid);
    }

    request.partner = partner;
    return true;
  }
}
