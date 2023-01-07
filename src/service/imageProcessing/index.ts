import { ObjectId } from 'mongoose';
import createError from 'http-errors';
import sharp, { AvailableFormatInfo, FormatEnum, RGBA, Region } from 'sharp';

import { JOB_TYPE } from '../../constants';
import { isValidFormatType } from '../../helpers/imageProcessor';
import { CacheService } from '../cache';
import { S3Service } from '../s3';
import { ImageService } from '../image';
import { UploadResponse } from '../../interfaces/service/image/uploadResponse';
import { TintColor } from '../../interfaces/service/image/tintColor';
import { General } from '../../interfaces/service/common/general';

interface ImageProcessingServiceOpts {
  cacheService: CacheService;
  s3Service: S3Service;
  imageService: ImageService;
  runBackgroundJobs: Function;
}

export class ImageProcessingService {
  cacheService: CacheService;
  s3Service: S3Service;
  imageService: ImageService;
  runBackgroundJobs: Function;

  constructor(opts: ImageProcessingServiceOpts) {
    this.cacheService = opts.cacheService;
    this.s3Service = opts.s3Service;
    this.imageService = opts.imageService;
    this.runBackgroundJobs = opts.runBackgroundJobs;
  }

  async getImageData(imageId: ObjectId) {
    try {
      const imageData = await this.cacheService.getImage(imageId);

      return imageData;
    } catch (error) {
      error.meta = { ...error.meta, 'imageProcessing.getImageData': { imageId } };
      throw error;
    }
  }

  async metaData(image: Buffer): Promise<sharp.Metadata> {
    try {
      const metaData = await sharp(image).metadata();

      return metaData;
    } catch (error) {
      error.meta = { ...error.meta, 'imageProcessing.metaData': { image } };
      throw error;
    }
  }

  async resize(publicId: ObjectId, width: number, height: number): Promise<General> {
    try {
      const image = await this.getImageData(publicId);

      const buffer = Buffer.from(image.buffer, 'base64');
      const metaData = await this.metaData(buffer);

      if (width === 0) {
        width = metaData.width;
      }

      if (height === 0) {
        height = metaData.height;
      }

      if (width > metaData.width) {
        throw createError(422, 'Width is too large');
      }

      if (height > metaData.height) {
        throw createError(422, 'Height is too large');
      }

      const resizedBuffer = await sharp(buffer).resize(width, height).toFormat(metaData.format).toBuffer();

      const imageData = {
        ...image,
        buffer: resizedBuffer,
      };

      const imageDataWithBufferString = {
        ...image,
        processType: JOB_TYPE.resize.name,
        buffer: resizedBuffer.toString('base64'),
      };

      this.runBackgroundJobs({
        name: JOB_TYPE.resize.name,
        meta: imageDataWithBufferString,
        className: this.cacheService,
        jobToProcess: this.cacheService.setImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateS3.name,
        meta: imageData,
        className: this.s3Service,
        jobToProcess: this.s3Service.updateImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateRepo.name,
        meta: imageDataWithBufferString,
        className: this.imageService,
        jobToProcess: this.imageService.updateProcessedImage,
      });

      return { success: true, message: 'Image is resized' };
    } catch (error) {
      error.meta = { ...error.meta, 'imageProcessing.resize': { publicId, width, height } };
      throw error;
    }
  }

  async crop(publicId: ObjectId, dimension: Region): Promise<General> {
    try {
      const image = await this.getImageData(publicId);

      const buffer = Buffer.from(image.buffer, 'base64');
      const metaData = await this.metaData(buffer);

      if (dimension.width === 0) {
        dimension.width = metaData.width;
      }

      if (dimension.height === 0) {
        dimension.height = metaData.height;
      }

      if (dimension.left + dimension.width > metaData.width) {
        throw createError(422, 'Crop width is too large');
      }

      if (dimension.top + dimension.height > metaData.height) {
        throw createError(422, 'Crop height is too large');
      }

      const croppedBuffer = await sharp(buffer).extract(dimension).toFormat(metaData.format).toBuffer();

      const imageData = {
        ...image,
        buffer: croppedBuffer,
      };

      const imageDataWithBufferString = {
        ...image,
        processType: JOB_TYPE.crop.name,
        buffer: croppedBuffer.toString('base64'),
      };

      this.runBackgroundJobs({
        name: JOB_TYPE.crop.name,
        meta: imageDataWithBufferString,
        className: this.cacheService,
        jobToProcess: this.cacheService.setImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateS3.name,
        meta: imageData,
        className: this.s3Service,
        jobToProcess: this.s3Service.updateImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateRepo.name,
        meta: imageDataWithBufferString,
        className: this.imageService,
        jobToProcess: this.imageService.updateProcessedImage,
      });

      return { success: true, message: 'Image is cropped' };
    } catch (error) {
      error.meta = { ...error.meta, 'imageProcessing.crop': { publicId, dimension } };
      throw error;
    }
  }

  async grayscale(publicId: ObjectId): Promise<General> {
    try {
      const image = await this.getImageData(publicId);

      const buffer = Buffer.from(image.buffer, 'base64');
      const metaData = await this.metaData(buffer);

      const grayscaledBuffer = await sharp(buffer).grayscale(true).toFormat(metaData.format).toBuffer();

      const imageData = {
        ...image,
        buffer: grayscaledBuffer,
      };

      const imageDataWithBufferString = {
        ...image,
        processType: JOB_TYPE.grayscale.name,
        buffer: grayscaledBuffer.toString('base64'),
      };

      this.runBackgroundJobs({
        name: JOB_TYPE.grayscale.name,
        meta: imageDataWithBufferString,
        className: this.cacheService,
        jobToProcess: this.cacheService.setImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateS3.name,
        meta: imageData,
        className: this.s3Service,
        jobToProcess: this.s3Service.updateImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateRepo.name,
        meta: imageDataWithBufferString,
        className: this.imageService,
        jobToProcess: this.imageService.updateProcessedImage,
      });

      return { success: true, message: 'Image is grayscaled' };
    } catch (error) {
      error.meta = { ...error.meta, 'imageProcessing.grayscale': { publicId } };
      throw error;
    }
  }

  async tint(publicId: ObjectId, tintColor: TintColor): Promise<General> {
    try {
      const image = await this.getImageData(publicId);

      const buffer = Buffer.from(image.buffer, 'base64');
      const metaData = await this.metaData(buffer);

      const tintOptions = { r: tintColor.red, g: tintColor.green, b: tintColor.blue };

      const tintedBuffer = await sharp(buffer)
        .tint(tintOptions as unknown as RGBA)
        .toFormat(metaData.format)
        .toBuffer();

      const imageData = {
        ...image,
        buffer: tintedBuffer,
      };

      const imageDataWithBufferString = {
        ...image,
        processType: JOB_TYPE.tint.name,
        buffer: tintedBuffer.toString('base64'),
      };

      this.runBackgroundJobs({
        name: JOB_TYPE.tint.name,
        meta: imageDataWithBufferString,
        className: this.cacheService,
        jobToProcess: this.cacheService.setImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateS3.name,
        meta: imageData,
        className: this.s3Service,
        jobToProcess: this.s3Service.updateImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateRepo.name,
        meta: imageDataWithBufferString,
        className: this.imageService,
        jobToProcess: this.imageService.updateProcessedImage,
      });

      return { success: true, message: 'Image is tinted' };
    } catch (error) {
      error.meta = { ...error.meta, 'imageProcessing.tint': { publicId, tintColor } };
      throw error;
    }
  }

  async rotate(publicId: ObjectId, angle: number): Promise<General> {
    try {
      const image = await this.getImageData(publicId);

      const buffer = Buffer.from(image.buffer, 'base64');
      const metaData = await this.metaData(buffer);

      if (angle === 0) {
        throw createError(422, 'Angle must be greater than 0');
      }

      const rotatedBuffer = await sharp(buffer).rotate(angle).toFormat(metaData.format).toBuffer();

      const imageData = {
        ...image,
        buffer: rotatedBuffer,
      };

      const imageDataWithBufferString = {
        ...image,
        processType: JOB_TYPE.rotate.name,
        buffer: rotatedBuffer.toString('base64'),
      };

      this.runBackgroundJobs({
        name: JOB_TYPE.rotate.name,
        meta: imageDataWithBufferString,
        className: this.cacheService,
        jobToProcess: this.cacheService.setImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateS3.name,
        meta: imageData,
        className: this.s3Service,
        jobToProcess: this.s3Service.updateImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateRepo.name,
        meta: imageDataWithBufferString,
        className: this.imageService,
        jobToProcess: this.imageService.updateProcessedImage,
      });

      return { success: true, message: 'Image is rotated' };
    } catch (error) {
      error.meta = { ...error.meta, 'imageProcessing.rotate': { publicId, angle } };
      throw error;
    }
  }

  async blur(publicId: ObjectId, blurPoint: number): Promise<General> {
    try {
      const image = await this.getImageData(publicId);

      const buffer = Buffer.from(image.buffer, 'base64');
      const metaData = await this.metaData(buffer);

      if (!blurPoint) {
        throw createError(422, 'Blur point must be greater than 0');
      }

      const blurredBuffer = await sharp(buffer).blur(blurPoint).toFormat(metaData.format).toBuffer();

      const imageData = {
        ...image,
        buffer: blurredBuffer,
      };

      const imageDataWithBufferString = {
        ...image,
        processType: JOB_TYPE.blur.name,
        buffer: blurredBuffer.toString('base64'),
      };

      this.runBackgroundJobs({
        name: JOB_TYPE.blur.name,
        meta: imageDataWithBufferString,
        className: this.cacheService,
        jobToProcess: this.cacheService.setImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateS3.name,
        meta: imageData,
        className: this.s3Service,
        jobToProcess: this.s3Service.updateImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateRepo.name,
        meta: imageDataWithBufferString,
        className: this.imageService,
        jobToProcess: this.imageService.updateProcessedImage,
      });

      return { success: true, message: 'Image is blurred' };
    } catch (error) {
      error.meta = { ...error.meta, 'imageProcessing.blur': { publicId, blurPoint } };
      throw error;
    }
  }

  async sharpen(publicId: ObjectId, sharpenPoint: number): Promise<General> {
    try {
      const image = await this.getImageData(publicId);

      const buffer = Buffer.from(image.buffer, 'base64');
      const metaData = await this.metaData(buffer);

      if (!sharpenPoint) {
        throw createError(422, 'Sharpen point must be greater than 0');
      }

      const sharpenedBuffer = await sharp(buffer).sharpen(sharpenPoint).toFormat(metaData.format).toBuffer();

      const imageData = {
        ...image,
        buffer: sharpenedBuffer,
      };

      const imageDataWithBufferString = {
        ...image,
        processType: JOB_TYPE.sharpen.name,
        buffer: sharpenedBuffer.toString('base64'),
      };

      this.runBackgroundJobs({
        name: JOB_TYPE.sharpen.name,
        meta: imageDataWithBufferString,
        className: this.cacheService,
        jobToProcess: this.cacheService.setImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateS3.name,
        meta: imageData,
        className: this.s3Service,
        jobToProcess: this.s3Service.updateImage,
      });

      this.runBackgroundJobs({
        name: JOB_TYPE.updateRepo.name,
        meta: imageDataWithBufferString,
        className: this.imageService,
        jobToProcess: this.imageService.updateProcessedImage,
      });

      return { success: true, message: 'Image is sharpened' };
    } catch (error) {
      error.meta = { ...error.meta, 'imageProcessing.sharpen': { publicId, sharpenPoint } };
      throw error;
    }
  }

  async format(publicId: ObjectId, formatType: keyof FormatEnum | AvailableFormatInfo): Promise<UploadResponse> {
    try {
      const image = await this.getImageData(publicId);

      const buffer = Buffer.from(image.buffer, 'base64');

      if (!formatType) {
        throw createError(422, 'Format type must be provided');
      }

      if (!isValidFormatType(formatType as unknown as string)) {
        throw createError(422, 'Invalid format type');
      }

      const formattedBuffer = await sharp(buffer).toFormat(formatType).toBuffer();
      const file = {
        originalname: `${image.fileName.split('.')[0]}.${formatType}`,
        mimetype: `image/${formatType}`,
        buffer: formattedBuffer,
      };

      const result = await this.imageService.upload(file);
      result.message = `Image is formatted to ${formatType} type`;

      return result;
    } catch (error) {
      error.meta = { ...error.meta, 'imageProcessing.format': { publicId, formatType } };
      throw error;
    }
  }
}