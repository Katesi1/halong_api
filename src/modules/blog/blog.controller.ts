import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import type { Messages } from '../../i18n';
import { BlogService } from './blog.service';
import { ListPostsDto } from './dto/list-posts.dto';

/**
 * Blog công khai — proxy từ Citely, cache Redis. Không cần auth.
 * App/web gọi backend này; READ-KEY của Citely được giữ kín ở server.
 */
@ApiTags('Blog')
@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Public()
  @Get('posts')
  @ApiOperation({ summary: 'Danh sách bài blog (proxy Citely, cache 10 phút)' })
  listPosts(@Query() query: ListPostsDto, @Lang() msg: Messages) {
    return this.blogService.listPosts(query, msg);
  }

  @Public()
  @Get('posts/:slug')
  @ApiOperation({ summary: 'Chi tiết 1 bài blog theo slug' })
  getPost(@Param('slug') slug: string, @Lang() msg: Messages) {
    return this.blogService.getPost(slug, msg);
  }
}
