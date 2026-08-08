import { startServer } from './index';

const port = Number(process.env.PORT ?? 3001);

startServer(port).then(({ port: boundPort }) => {
  console.log(`bigdeal server listening on :${boundPort}`);
});
