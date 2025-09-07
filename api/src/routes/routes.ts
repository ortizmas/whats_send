import { publishDedicated, publishShared, redis } from "../conection/redis";
import { isWorkerAlive, pickWorkerBalanced, pickWorkerRandom } from "../helper";
import {Router} from 'express'
import { openapiSpec } from "../swagger";
import swaggerUi from "swagger-ui-express";
const router=Router()


router.get("/docs.json",(req,res)=>{
res.json(openapiSpec);
})
router.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec, { explorer: true }));
// Workers vivos
router.get("/workers", async (_req, res) => {
  const ids = await redis.smembers("wpp-worker-list");
  const workers: any[] = [];
  for (const id of ids) {
    const info = await redis.get(`wpp-worker:${id}`);
    if (info) workers.push(JSON.parse(info));
  }
  res.json({ replicas: workers.length, workers });
});

router.post("/start", async (req, res) => {
  const { session, hostname } = req.body as {
    session?: string;
    hostname?: string;
  };
  if (!session) return res.status(400).json({ error: "Informe a sessão" });

  if (hostname) {
    if (!(await isWorkerAlive(hostname,redis))) {
      return res.status(409).json({ error: `Worker ${hostname} indisponível` });
    }
    await publishDedicated(hostname, { action: "startSession", session });
    return res.json({
      message: `Sessão ${session} enviada para ${hostname}. Consulte QR em /qr/${session}`,
    });
  }

  const target = await pickWorkerBalanced(session,redis);
  if (target) {
    await publishDedicated(target, { action: "startSession", session });
    return res.json({
      message: `Sessão ${session} balanceada para ${target}. Consulte QR em /qr/${session}`,
    });
  }

  publishShared({ action: "startSession", session });
  res.json({
    message: `Sessão ${session} enviada para a fila compartilhada. Consulte QR em /qr/${session}`,
  });
});

router.post("/send", async (req, res) => {
  const { session, number, message, hostname ,random} = req.body as {
    session?: string;
    number?: string;
    message?: string;
    hostname?: string;
    random?:boolean
  };
  if (!session || !number || !message) {
    return res
      .status(400)
      .json({ error: "Campos obrigatórios: session, number, message" });
  }

  const payload = { action: "sendMessage", session, number, message };

  if (hostname) {
    if (!(await isWorkerAlive(hostname,redis))) {
      return res.status(409).json({ error: `Worker ${hostname} indisponível` });
    }
    await publishDedicated(hostname, payload);
    return res.json({ message: `Mensagem enviada diretamente para ${hostname}` });
  }
  if(random){
      const target = await pickWorkerRandom(redis);
      if (target) {
        await publishDedicated(target, payload);
        return res.json({ message: `Mensagem enviada aleatoriamente para ${target}` });
      }
  }
  const target = await pickWorkerBalanced(session,redis);
  if (target) {
    await publishDedicated(target, payload);
    return res.json({ message: `Mensagem balanceada para ${target}` });
  }

  publishShared(payload);
  res.json({ message: "Mensagem enviada para fila compartilhada" });
});

// QRCode
router.get("/qr/:session", async (req, res) => {
  const { session ,base64} = req.params as {
    session:string,
    base64:boolean
  };
  const qrData = await redis.get(`wpp-event:${session}:qrCode`);
  if (!qrData)
    return res.status(404).json({ error: "QRCode não disponível" });
  const data = JSON.parse(qrData);
  if(!base64){
  return res
    .type("html")
    .send(
      `<html><body><h2>QR Code da sessão ${session}</h2><img src="${data.qr}" /></body></html>`
    );
  }
return res.json({base64:data.qr}) 
});

// Status
router.get("/status/:session", async (req, res) => {
  const { session } = req.params;
  const statusData = await redis.get(`wpp-event:${session}:status`);
  res.json(
    statusData ? JSON.parse(statusData) : { error: "Sem status disponível" }
  );
});
export{
    router
}