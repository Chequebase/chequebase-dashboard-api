import mongoose from "mongoose";

if (!process.env.DB_URI) {
  throw new Error("Database uri is missing");
}

const cdb = mongoose.createConnection(process.env.DB_URI!);

cdb.on("error", (err) => {
  process.stderr.write("connection to mono db failed\n");
  process.stderr.write(err);
});

cdb.once("open", function () {
  process.stdout.write("MongoDB database connection to mono successful\n");
});

export { cdb };
