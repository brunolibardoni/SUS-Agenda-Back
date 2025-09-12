import { createClient } from 'redis';

const redisClient = createClient();

redisClient.on('error', (err) => {
  console.error('Erro no Redis:', err);
});

await redisClient.connect();

export default redisClient;
