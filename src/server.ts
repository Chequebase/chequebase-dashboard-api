import 'module-alias/register';
import 'reflect-metadata';
import 'dotenv/config';
import app from './app';
import { Server } from 'http';
import Logger from './modules/common/utils/logger';
import { cdb } from './modules/common/mongoose';
import worker from './queues/worker'

const logger = new Logger('main');
let server: Server

async function bootstrap() {
  await cdb.asPromise() // establish db connection
  const port = process.env.PORT || 3000;
  server = app.listen(port, () => {
    logger.log(`Server started ⚡`, { port, pid: process.pid })
  });
}

bootstrap()
worker.process()

function gracefulShutdown(signal: string) {
  logger.log('gracefully shutting down', { signal });
  server.close(async () => {
    try {
      // garbage collection; close all existing processes here
      await worker.close()
      await cdb.close(false)
      process.exit(0);
    } catch (error: any) {
      logger.error('error shutting down', { message: error?.message });
      process.exit(1);
    }
  })
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);