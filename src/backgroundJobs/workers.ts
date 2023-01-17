import EventEmitter from 'events';
import { Worker } from 'worker_threads';

import { workers } from '../constants';
import { socket } from '../index';

export const workerEvent = new EventEmitter();

workerEvent.on(workers.PROCESS_IMAGE, (meta) => {
  const fileName = `${process.cwd()}/dist/workerThreads/processImage.js`;
  const worker = new Worker(fileName, { workerData: meta.data });

  worker.on('message', (meta) => {
    workerEvent.emit(workers.EMIT_DATA, meta);
  });

  worker.on('error', (error) => {
    console.log(error);
  });
});

// workerEvent.on(workers.EMIT_DATA, (meta) => {
//   console.log(`🚀 ~ file: workers.ts:27 ~ workerEvent.on ~ meta.data.publicId`, meta.data.publicId);
//   socket.to().emit(meta.data.publicId, meta);
// });