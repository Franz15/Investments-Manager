#!/usr/bin/env node
// MCP de Investments-Manager: una única tool genérica que proxya la API REST
// con login JWT automático. Credenciales en mcp/.env (ver .env.example).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

try {
  process.loadEnvFile(new URL('.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
} catch {
  // sin .env: las credenciales pueden venir del env del cliente MCP
}

const API = process.env.IM_API_URL || 'https://investments-manager-production.up.railway.app/api';

async function apiRequest(method, path, body, user) {
  if (!process.env.IM_TOKEN)
    throw new Error('Falta IM_TOKEN en mcp/.env (token del usuario fantasma claude)');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.IM_TOKEN}`,
      ...(user ? { 'X-Act-As-User': user } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `${res.status}: IM_TOKEN inválido o caducado — regenera el token del usuario claude. (${text.slice(0, 200)})`
    );
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return text || '(sin contenido)';
}

const server = new McpServer({ name: 'investments-manager', version: '1.0.0' });

server.registerTool(
  'api_request',
  {
    description: `Llama a la API REST de Investments-Manager (finanzas familiares). Los paths son relativos a /api. CRUD REST estándar: GET /recurso lista, GET /recurso/:id detalle, POST crea, PUT /:id edita, DELETE /:id borra.
Recursos: /accounts (cuentas), /subaccounts (subcuentas; aquí vive el balance), /transactions (movimientos), /categories, /budgets (presupuestos), /debts (deudas), /investments, /investment-history, /portfolio-funds, /businesses (negocios), /recurring-transactions, /manual-assets, /bank-connections (bancos conectados; POST /bank-connections/:id/sync sincroniza), /dashboard (resumen global), /forecasts.
Para orientarte empieza con GET /dashboard o GET /accounts.
Multiperfil: GET /users lista todos los perfiles (admin). El parámetro "user" ejecuta la llamada como otro perfil (ej. "ana"); sin él, actúa como el usuario del login.`,
    inputSchema: {
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
      path: z.string().describe('Path relativo a /api, ej. /transactions?limit=20'),
      body: z.record(z.any()).optional().describe('Cuerpo JSON para POST/PUT'),
      user: z.string().optional().describe('Actuar como este perfil (requiere admin), ej. "ana"'),
    },
  },
  async ({ method, path, body, user }) => {
    try {
      return { content: [{ type: 'text', text: await apiRequest(method, path, body, user) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

await server.connect(new StdioServerTransport());
