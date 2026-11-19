// Paso 0 de la spec 003: `web-push` manda un aviso cifrado con VAPID a un servicio de push falso local.
// Las claves se generan acá; nunca son reales.
import { execFileSync } from 'node:child_process';
import { createECDH, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { Agent, createServer } from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import * as webpush from 'web-push';

type Recibido = { headers: IncomingHttpHeaders; body: Buffer };
let recibidos: Recibido[] = [];
let respuesta = 201;
let base = '';
// `web-push` solo habla HTTPS: el servicio falso usa un certificado autofirmado para 127.0.0.1, generado
// con openssl, y el cliente confía solo en ese certificado (sin desactivar la verificación TLS).
const dir = mkdtempSync(join(tmpdir(), 'push-falso-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
  '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
const cert = readFileSync(join(dir, 'cert.pem'));
const agent = new Agent({ ca: cert });
const servidor = createServer({ key: readFileSync(join(dir, 'key.pem')), cert }, (req, res) => {
  const partes: Buffer[] = [];
  req.on('data', (c) => partes.push(c));
  req.on('end', () => { recibidos.push({ headers: req.headers, body: Buffer.concat(partes) }); res.writeHead(respuesta); res.end(); });
});

beforeAll(async () => {
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', () => ok()));
  base = `https://127.0.0.1:${(servidor.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
  rmSync(dir, { recursive: true, force: true });
});

// Una suscripción como la que arma el navegador: clave pública P-256 y secreto de 16 bytes.
function suscripcionFalsa(endpoint: string) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
}

test('paso 0: el servicio falso recibe un POST cifrado aes128gcm con VAPID', async () => {
  recibidos = [];
  respuesta = 201;
  const vapid = webpush.generateVAPIDKeys();
  const r = await webpush.sendNotification(
    suscripcionFalsa(`${base}/push/abc`),
    JSON.stringify({ titulo: 'Cambio en la semana', cuerpo: 'Prueba' }),
    { vapidDetails: { subject: 'mailto:prueba@ejemplo.test', publicKey: vapid.publicKey, privateKey: vapid.privateKey }, TTL: 60, agent },
  );
  expect(r.statusCode).toBe(201);
  expect(recibidos).toHaveLength(1);
  expect(recibidos[0].headers['content-encoding']).toBe('aes128gcm');
  expect(String(recibidos[0].headers.authorization)).toMatch(/^vapid t=.+, k=.+$/);
  expect(recibidos[0].body.includes(Buffer.from('Cambio en la semana'))).toBe(false); // viaja cifrado
});

test('paso 0: un 410 del servicio llega como error con statusCode', async () => {
  respuesta = 410;
  const vapid = webpush.generateVAPIDKeys();
  await expect(webpush.sendNotification(suscripcionFalsa(`${base}/push/vencida`), 'x', {
    vapidDetails: { subject: 'mailto:prueba@ejemplo.test', publicKey: vapid.publicKey, privateKey: vapid.privateKey }, agent,
  })).rejects.toMatchObject({ statusCode: 410 });
});
