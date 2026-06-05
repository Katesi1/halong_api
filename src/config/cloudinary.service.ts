import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadImage(
    file: Express.Multer.File,
    folder = 'property/rooms',
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          transformation: [
            { width: 1920, height: 1080, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result!);
        },
      );

      const readable = new Readable();
      readable.push(file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  async deleteImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }

  // Tạo URL thumbnail tự động
  getThumbnailUrl(imageUrl: string, width = 400, height = 300): string {
    return imageUrl.replace('/upload/', `/upload/w_${width},h_${height},c_fill,q_auto,f_auto/`);
  }

  /**
   * Upload generic file (image, PDF, ...) cho /uploads endpoint.
   * - image/*: strip EXIF, resize max 1920x1080, auto format
   * - application/pdf: raw upload, không transform
   */
  async uploadAttachment(
    file: Express.Multer.File,
    folder = 'chat/attachments',
  ): Promise<UploadApiResponse> {
    const isImage = file.mimetype.startsWith('image/');
    const resourceType: 'image' | 'raw' = isImage ? 'image' : 'raw';

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          // Random suffix tránh collision tên file
          use_filename: false,
          unique_filename: true,
          // Image: strip EXIF + resize
          ...(isImage
            ? {
                transformation: [
                  { width: 1920, height: 1080, crop: 'limit' },
                  { quality: 'auto', fetch_format: 'auto' },
                ],
                // strip metadata (EXIF, GPS) — image_metadata: false
              }
            : {}),
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result!);
        },
      );
      const readable = new Readable();
      readable.push(file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  async deleteResource(publicId: string, resourceType: 'image' | 'raw' = 'image'): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  }
}
