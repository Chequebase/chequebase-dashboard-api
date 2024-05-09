import 'module-alias/register';
import 'reflect-metadata';
import 'dotenv/config';
import app from './app';
import { Server } from 'http';
import Logger from './modules/common/utils/logger';
import { cdb } from './modules/common/mongoose';
import worker from './queues/worker'
import { AnchorVirtualAccountClient } from './modules/virtual-account/providers/anchor.client';

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

async function run() {
  const srv = new AnchorVirtualAccountClient()

  const result = await srv.createStaticVirtualAccount({
    currency: "NGN",
    email: "chequebase@gmail.com",
    identity: {
      number: "10101010101",
      type: "bvn"
    },
    name: "Paystack settlement",
    provider: "anchor",
    reference: Date.now().toString(),
    type: "static",
  })

  console.log(result)
}

run()
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);