import amqp from "amqplib";
import Redis from "ioredis";

let channel: amqp.Channel;
const redis = new Redis({ host: process.env.REDIS_HOST || "redis", port: 6379 });

async function connectRabbit(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const connection = await amqp.connect(
        process.env.RABBITMQ_URL || "amqp://guest:guest@rabbitmq:5672"
      );
      channel = await connection.createChannel();

      await channel.assertQueue("sessions.requests", { durable: true });
      await channel.assertQueue("sessions.responses", { durable: true });

      // Consumidor de respostas → salva último evento com TTL
      channel.consume("sessions.responses", async (msg) => {
        if (!msg) return;
        try {
          const data = JSON.parse(msg.content.toString());
          const { session, event } = data;
          if (session && event) {
            await redis.set(
              `wpp-event:${session}:${event}`,
              JSON.stringify(data),
              "EX",
              300
            );
          }
        } catch {}
        channel.ack(msg);
      });

      return;
    } catch {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Não foi possível conectar ao RabbitMQ");
}



async function publishDedicated(workerId: string, payload: unknown) {
  const q = `sessions.requests.${workerId}`;
  await channel.assertQueue(q, { durable: true });
  channel.sendToQueue(q, Buffer.from(JSON.stringify(payload)));
}

function publishShared(payload: unknown) {
  channel.sendToQueue("sessions.requests", Buffer.from(JSON.stringify(payload)));
}


export{
    publishDedicated,
    publishShared,
    connectRabbit,
    redis
}