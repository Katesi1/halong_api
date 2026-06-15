import { Module } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { PropertiesController } from './properties.controller';
import { FavoritesService } from './favorites.service';
import { FavoritesController } from './favorites.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PropertiesController, FavoritesController],
  providers: [PropertiesService, FavoritesService],
  exports: [PropertiesService, FavoritesService],
})
export class PropertiesModule {}
