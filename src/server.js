import { createApp } from './app.js';
import { connectDatabase } from './database.js';
import { loadReferences } from './references.js';

const host = process.env.PACCO_HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const references = await loadReferences();
const database = connectDatabase();
const app = createApp(database, references, { origin: process.env.PACCO_ORIGIN });
const server = app.listen(port, host, () => console.log(`PACCO audit register listening on http://${host}:${port}`));

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await new Promise((resolve) => server.close(resolve));
  await database.close();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
