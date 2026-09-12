import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './lib/auth.js'; // path to your auth file

const app = new Hono();
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.use('*', cors());
console.log('Server is starting...');


serve({
  fetch: app.fetch,
  // TODO: Get the port from .env.BETTER_AUTH_URL
  port: 5000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})