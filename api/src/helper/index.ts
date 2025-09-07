import Redis from "ioredis";


async function isWorkerAlive(id: string,redis:Redis): Promise<boolean> {
  const hb = await redis.get(`wpp-worker:${id}`);
  return Boolean(hb);
}

async function getWorkersAlive(redis:Redis): Promise<string[]> {
  const ids = await redis.smembers("wpp-worker-list");
  const vivos: string[] = [];
  for (const id of ids) {
    if (await isWorkerAlive(id,redis)) vivos.push(id);
  }
  return vivos;
}

function hashConsistente(key: string, buckets: string[]): string {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  const idx = Math.abs(hash) % buckets.length;
  return buckets[idx];
}

async function pickWorkerBalanced(session: string,redis:Redis): Promise<string | null> {
  const vivos = await getWorkersAlive(redis);
  if (vivos.length === 0) return null;
  return hashConsistente(session, vivos);
}


async function pickWorkerRandom(redis:Redis): Promise<string | null> {
  const vivos = await getWorkersAlive(redis);
  if (vivos.length === 0) return null;
  const i = Math.floor(Math.random() * vivos.length);
  return vivos[i];
}

export {
    pickWorkerBalanced,
    hashConsistente,
    getWorkersAlive,
    pickWorkerRandom,
        isWorkerAlive
}