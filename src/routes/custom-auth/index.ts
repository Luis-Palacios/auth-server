import { Hono } from 'hono';
import { invitesRoute } from './invites.js';

export const customAuthRoute = new Hono().route('/invites', invitesRoute);
