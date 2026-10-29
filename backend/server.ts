import "dotenv/config";
import express from "express";
import { testConnection } from "./db/db";

const app = express();
const PORT = process.env.PORT || 3333;

app.use(express.json());

testConnection()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MySQL:", error.message);
    process.exit(1);
  });
