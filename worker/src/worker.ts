// src/worker.ts
import os from "os";
import amqp from "amqplib";
import Redis from "ioredis";
import { create, Whatsapp } from "@wppconnect-team/wppconnect";
import fs from "fs-extra";

const sessions: Record<string, Whatsapp> = {};
const redis = new Redis({ host: process.env.REDIS_HOST || "redis", port: 6379 });
const WORKER_ID =
  process.env.WORKER_ID ||
  process.env.HOSTNAME ||
  os.hostname() ||
  process.pid.toString();

// ====== Helpers de token ======
async function loadToken(session: string): Promise<any | undefined> {
  const keys = await redis.keys(`wpp-session:${session}-*`);
  for (const key of keys) {
    const tokenStr = await redis.get(key);
    if (tokenStr) {
      console.log(`[Worker ${WORKER_ID}] Token encontrado no Redis: ${key}`);
      return JSON.parse(tokenStr);
    }
  }
  console.log(`[Worker ${WORKER_ID}] Nenhum token encontrado para sessão ${session}`);
  return undefined;
}

async function saveToken(session: string, token: any) {
  const key = `wpp-session:${session}-${WORKER_ID}`;
  await redis.set(key, JSON.stringify(token));
  console.log(`[Worker ${WORKER_ID}] Token salvo no Redis: ${key}`);
}

async function removeAllSingletonLocks() {
  const tokenBase = "tokens";
  if (!await fs.pathExists(tokenBase)) return;
  const folders = await fs.readdir(tokenBase);
  for (const folder of folders) {
    const lockFile = `${tokenBase}/${folder}/SingletonLock`;
    if (await fs.pathExists(lockFile)) {
      console.log(`Removendo SingletonLock de ${folder}`);
      await fs.remove(lockFile);
    }
  }
}

// ====== Heartbeat e tracking de sessões ======
async function heartbeat() {
  await redis.sadd("wpp-worker-list", WORKER_ID);
  const payload = {
    hostname: WORKER_ID,
    startedAt: new Date().toISOString(),
    sessions: await redis.smembers(`wpp-worker-sessions:${WORKER_ID}`)
  };
  await redis.set(`wpp-worker:${WORKER_ID}`, JSON.stringify(payload), "EX", 45);
}
setInterval(heartbeat, 15000);
heartbeat();

async function trackSessionBind(session: string) {
  await redis.sadd(`wpp-worker-sessions:${WORKER_ID}`, session);
  await redis.set(`wpp-session-owner:${session}`, WORKER_ID, "EX", 60 * 60 * 24);
}
async function trackSessionUnbind(session: string) {
  await redis.srem(`wpp-worker-sessions:${WORKER_ID}`, session);
  await redis.del(`wpp-session-owner:${session}`);
}

// ====== RabbitMQ ======
async function connectRabbitMQ(retries = 5, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const url = process.env.RABBITMQ_URL || "amqp://guest:guest@rabbitmq:5672";
      const conn = await amqp.connect(url);
      return conn;
    } catch {
      console.log(`Tentativa ${i + 1} falhou, reconectando em ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("Não foi possível conectar ao RabbitMQ");
}

async function startWorker() {
  await fs.mkdirp("tokens");
 
  const connection = await connectRabbitMQ();
  const channel = await connection.createChannel();
  
  await channel.assertQueue("sessions.requests", { durable: true });
  const dedicatedQueue = `sessions.requests.${WORKER_ID}`;
  await channel.assertQueue(dedicatedQueue, { durable: true });
  await channel.assertQueue("sessions.responses", { durable: true });

  const sendQR = (qr: string, session: string) => {
    channel.sendToQueue(
      "sessions.responses",
      Buffer.from(JSON.stringify({ event: "qrCode", session, qr }))
    );
  };

  channel.consume("sessions.requests", (msg) => handleMessage(channel, msg), { noAck: false });
  channel.consume(dedicatedQueue, (msg) => handleMessage(channel, msg), { noAck: false });

  async function handleMessage(ch: amqp.Channel, msg?: amqp.ConsumeMessage | null) {
    if (!msg) return;
    const data = JSON.parse(msg.content.toString());
    const { action, session, number, message } = data as {
      action: "startSession" | "sendMessage";
      session: string;
      number?: string;
      message?: string;
    };

    try {
      // ===== START SESSION =====
      if (action === "startSession" && !sessions[session]) {
        const oldToken = await loadToken(session);

        // define uma pasta de token única por worker e sessão
        let tokenFolder = `tokens/${session}-${WORKER_ID}`;
        let counter = 1;
        while (await fs.pathExists(tokenFolder)) {
          tokenFolder = `tokens/${session}-${WORKER_ID}-${counter++}`;
        }

        // copia pasta padrão ou de outro worker quando útil
        const defaultFolder = `tokens/${session}`;
        if (!await fs.pathExists(tokenFolder)) {
          if (await fs.pathExists(defaultFolder)) {
            console.log(`[Worker ${WORKER_ID}] Copiando token principal`);
            await fs.copy(defaultFolder, tokenFolder);
          } else {
            const folders = await fs.readdir("tokens");
            for (const f of folders) {
              if (f.startsWith(session + "-") && f !== tokenFolder) {
                console.log(`[Worker ${WORKER_ID}] Copiando token de outro worker`);
                await fs.copy(`tokens/${f}`, tokenFolder);
                break;
              }
            }
          }
        }

        // evita lock antigo
        const singletonLock = `${tokenFolder}/SingletonLock`;
        if (await fs.pathExists(singletonLock)) {
          console.log(`[Worker ${WORKER_ID}] Removendo SingletonLock antigo`);
          await fs.remove(singletonLock);
        }

        const userDataDir = tokenFolder;

        const client = await create({
          session,
          folderNameToken: tokenFolder,
          sessionToken: oldToken,
          puppeteerOptions: {
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            headless: true,
            userDataDir
          },
          catchQR: (qr) => sendQR(qr, session),
          statusFind: (status) => {
            ch.sendToQueue(
              "sessions.responses",
              Buffer.from(JSON.stringify({ event: "status", session, status, worker: WORKER_ID }))
            );
          }
        });

        client.onStateChange(async () => {
          try {
            const newToken = await client.getSessionTokenBrowser();
            await saveToken(session, newToken);
          } catch {}
        });

        sessions[session] = client;
        await trackSessionBind(session);

        ch.sendToQueue(
          "sessions.responses",
          Buffer.from(JSON.stringify({ event: "sessionReady", session, worker: WORKER_ID }))
        );
      }

      // ===== SEND MESSAGE =====
      if (action === "sendMessage") {
        if (!sessions[session]) {
          const oldToken = await loadToken(session);
          if (!oldToken) {
            ch.sendToQueue(
              "sessions.responses",
              Buffer.from(JSON.stringify({ event: "messageError", session, reason: "session_not_active" }))
            );
            ch.ack(msg);
            return;
          }

          await removeAllSingletonLocks();

          const tokenFolder = `tokens/${session}-${WORKER_ID}`;
          const userDataDir = `${tokenFolder}/puppeteer_user_data`;

          const client = await create({
            session,
            folderNameToken: tokenFolder,
            sessionToken: oldToken,
            puppeteerOptions: {
              args: ["--no-sandbox", "--disable-setuid-sandbox"],
              headless: true,
              userDataDir
            }
          });

          client.onStateChange(async () => {
            try {
              const newToken = await client.getSessionTokenBrowser();
              await saveToken(session, newToken);
            } catch {}
          });

          sessions[session] = client;
          await trackSessionBind(session);
        }

        await sessions[session].sendText(String(number), String(message));
        console.log(`[Worker ${WORKER_ID}] Mensagem enviada: ${number} -> ${message}`);
        ch.sendToQueue(
          "sessions.responses",
          Buffer.from(JSON.stringify({ event: "messageSent", session, number, message, worker: WORKER_ID }))
        );
      }

      ch.ack(msg);
    } catch (err: any) {
      ch.sendToQueue(
        "sessions.responses",
        Buffer.from(JSON.stringify({ event: "error", worker: WORKER_ID, message: err?.message || String(err), session }))
      );
      ch.ack(msg);
    }
  }
}

startWorker().catch((err) => console.error(err));
