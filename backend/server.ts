import { env } from "./config/env";
import express from "express";
import cors from "cors";
import { testConnection } from "./db/db";
import { errorHandler, notFoundHandler } from "./middlewares/error_handler";
import { authRouter } from "./routers/auth_router";
import { memberRouter } from "./routers/member_router";

const app = express();

app.set("trust proxy", env.trustProxy);
app.use(cors({ origin: env.corsOrigins.includes("*") ? true : env.corsOrigins }));
app.use(express.json());

app.use("/auth", authRouter);
app.use("/membros", memberRouter);

app.use(notFoundHandler);
app.use(errorHandler);

testConnection()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MySQL:", error.message);
    process.exit(1);
  });
