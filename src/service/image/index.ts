import EventEmitter from 'events';
import fs from 'fs';
import { v4 as uuid } from 'uuid';

import { JOB, event } from '../../constants';

import { CacheService } from '../cache';
import { UploadResponse, General, FileType, Image, Storage, ConstructorOpts } from '../../types';

export class ImageService {
  cacheService: CacheService;
  queueEvent: EventEmitter;

  constructor(opts: ConstructorOpts) {
    this.cacheService = opts.cacheService;
    this.queueEvent = opts.queueEvent;
  }

  async upload(file: Express.Multer.File | FileType): Promise<UploadResponse> {
    try {
      const image: Image = {
        fileName: file.originalname,
        buffer: file.buffer.toString('base64'),
      };

      const storage: Storage = {
        _id: uuid(),
        effects: ['original'],
        effectsIdx: 0,
        effectsApplied: { original: image },
      };

      this.queueEvent.emit(event.BACKGROUND_JOB, JOB.cacheStorage.name, { storage });

      return { success: true, message: 'Uploaded image successfully', data: { publicId: storage._id } };
    } catch (error) {
      error.meta = { ...error.meta, 'imageService.upload': { file } };
      throw error;
    }
  }

  async download(publicId: string): Promise<General> {
    try {
      const storage = (await this.cacheService.getData(publicId)) as unknown as Storage;

      const effect = storage.effects[storage.effectsIdx];
      const image = storage.effectsApplied[effect];

      const directory = process.cwd().split('src')[0];
      const [originalName, extension] = image.fileName.split('.');
      const fileName = `${directory}/tmp/${
        image.processType ? `${image.processType}-` : ''
      }${originalName}-${uuid()}.${extension}`;

      const buffer = Buffer.from(image.buffer, 'base64');

      await fs.writeFileSync(fileName, buffer);

      return { success: true, message: 'Downloaded image successfully' };
    } catch (error) {
      error.meta = { ...error.meta, 'imageService.download': { publicId } };
      throw error;
    }
  }

  async undo(publicId: string): Promise<UploadResponse> {
    try {
      const storage = (await this.cacheService.getData(publicId)) as unknown as Storage;

      if (storage.effectsIdx > 0) {
        storage.effectsIdx -= 1;
      }

      this.queueEvent.emit(event.BACKGROUND_JOB, JOB.cacheStorage.name, { storage });

      return { success: true, message: 'Previous effect applied', data: { publicId: storage._id } };
    } catch (error) {
      error.meta = { ...error.meta, 'imageService.undo': { publicId } };
      throw error;
    }
  }

  async redo(publicId: string): Promise<UploadResponse> {
    try {
      const storage = (await this.cacheService.getData(publicId)) as unknown as Storage;

      if (storage.effectsIdx !== storage.effects.length - 1) {
        storage.effectsIdx += 1;
      }

      this.queueEvent.emit(event.BACKGROUND_JOB, JOB.cacheStorage.name, { storage });

      return { success: true, message: 'Previous effect applied', data: { publicId: storage._id } };
    } catch (error) {
      error.meta = { ...error.meta, 'imageService.redo': { publicId } };
      throw error;
    }
  }
}
