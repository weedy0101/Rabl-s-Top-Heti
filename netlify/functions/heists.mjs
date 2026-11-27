import { getStore } from '@netlify/blobs';
import { handleRequest } from '../lib/api.mjs';

export default async (req) => {
  // Erős konzisztencia: egy módosítás azonnal látszik mindenkinek.
  const store = getStore({ name: 'heists', consistency: 'strong' });
  return handleRequest(req, { store, adminPassword: process.env.ADMIN_PASSWORD });
};

export const config = {
  path: ['/api/heists', '/api/heists/*', '/api/login'],
};
