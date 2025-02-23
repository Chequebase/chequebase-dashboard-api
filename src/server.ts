import 'module-alias/register';
import 'reflect-metadata';
import 'dotenv/config';
import app from './app';
import { Server } from 'http';
import { cdb } from './modules/common/mongoose';
import worker from './queues/worker'
import { registerGlobalLogger } from './modules/common/utils/logger-v2';

const globalLogger = registerGlobalLogger();

let server: Server

async function bootstrap() {
  await cdb.asPromise() // establish db connection
  const port = process.env.PORT || 3000;
  server = app.listen(port, () => {
    globalLogger.info({ msg: "Server started ⚡", port, pid: process.pid });
  });
}

bootstrap()
worker.process()

function gracefulShutdown(signal: string) {
  globalLogger.info({msg: "gracefully shutting down", signal });
  server.close(async () => {
    try {
      await worker.close()
      await cdb.close(false)
      process.exit(0);
    } catch (error: any) {
      globalLogger.error({
        msg: "error shutting down",
        message: error?.message,
      });
      process.exit(1);
    }
  })
}

process.on('SIGTERM', gracefulShutdown);

process.on('SIGINT', gracefulShutdown);

process.on("unhandledRejection", (reason, promise) => {
  globalLogger.error({
    msg: "unhandled Rejection error",
    context: "unhandledRejection",
    reason,
    promise,
  });
});

process.on("uncaughtException", (err, origin) => {
  globalLogger.error({
    msg: "uncaught Exception error",
    context: "uncaughtException",
    err,
    origin,
  });
});

process.on("exit", (code) => {
  globalLogger.info({
    msg: "Process exited",
    context: "exit",
    code,
  });
});