import mongoose, { isValidObjectId } from "mongoose";
import { getGlobalLogger } from "./utils/logger-v2";

const logger = getGlobalLogger()

if (!process.env.DB_URI) {
  throw new Error("Database uri is missing");
}

const cdb = mongoose.createConnection(process.env.DB_URI!);

cdb.on("error", (err) => {
  logger.error({ msg: "connection to chequebase db failed", err });
});

cdb.once("open", function () {
  logger.info({ msg: "MongoDB database connection to chequebase successful" });
});

export { cdb, isValidObjectId };
