// src/api.ts
import express from "express";
import { connectRabbit} from "./conection/redis";
import {router} from './routes/routes'

const app = express();
app.use(express.json());
app.use(router)


app.listen(3000, async () => {
  await connectRabbit();
  console.log("🚀 API rodando na porta 3000");
});
