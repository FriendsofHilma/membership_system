#!/usr/bin/env node
/**
 * DFRI-eID verifier prototype for the Friends of Hilma website.
 *
 * This is an mTLS reverse proxy that mirrors the *behaviour* of the upstream
 * DFRI-eID Caddy verifier demo (X.509 client certificates, trusted CA, verified
 * identity forwarded to the app), implemented in Node so it can run on Windows
 * without the Linux/Caddy/Go demo stack.
 *
 * Listens on two ports:
 *   - public port (default 8080):  plain HTTP proxy to the Next.js app. Used for
 *     the normal public site and the /internal/login help page.
 *   - secure port (default 8443):  HTTPS that requests a client certificate and
 *     verifies it against DFRI_CA_FILE. On success, forwards verified identity
 *     headers to the Next.js app.
 *
 * PROTOTYPE ONLY. Not hardened for production. See ../../docs/dfri-eid-prototype.md
 */

import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const TARGET = new URL(process.env.DFRI_TARGET ?? "http://127.0.0.1:3000");
const PUBLIC_PORT = Number(process.env.DFRI_PUBLIC_PORT ?? 8080);
const SECURE_PORT = Number(process.env.DFRI_SECURE_PORT ?? 8443);
const CA_FILE =
  process.env.DFRI_CA_FILE ?? resolve("tools/dfri-verifier/certs/ca-bundle.crt.pem");
const SERVER_CERT_FILE =
  process.env.DFRI_SERVER_CERT ?? resolve("tools/dfri-verifier/certs/server-chain.crt.pem");
const SERVER_KEY_FILE =
  process.env.DFRI_SERVER_KEY ?? resolve("tools/dfri-verifier/certs/server.key.pem");

const IDENTITY_HEADERS = [
  "x-dfri-eid-subject",
  "x-dfri-eid-subject-dn",
  "x-dfri-eid-serial",
  "x-dfri-eid-issuer",
  "x-dfri-eid-authorized",
];

for (const [label, file] of [
  ["CA", CA_FILE],
  ["server certificate", SERVER_CERT_FILE],
  ["server key", SERVER_KEY_FILE],
]) {
  if (!existsSync(file)) {
    console.error(`Missing ${label} file: ${file}`);
    console.error("Run tools/dfri-verifier/generate-test-certs.sh first (see README).");
    process.exit(1);
  }
}

function formatDn(dn) {
  if (!dn || typeof dn !== "object") return "";
  return Object.entries(dn)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function identityFromSocket(socket) {
  if (!socket.authorized) return null;
  const cert = socket.getPeerCertificate();
  if (!cert || !cert.subject) return null;

  const subjectDn = formatDn(cert.subject);
  const commonName = cert.subject.CN;
  return {
    subject: commonName || subjectDn,
    subjectDn,
    serial: cert.serialNumber || "",
    issuer: cert.issuer?.CN || formatDn(cert.issuer),
  };
}

function headerSafe(value) {
  return String(value).replace(/[^\x20-\x7E]/g, "?");
}

function proxy(request, response, identity) {
  const headers = { ...request.headers };
  delete headers["host"];
  for (const name of IDENTITY_HEADERS) delete headers[name];

  // Keep the original Host so Next.js generates correct absolute redirects.
  headers.host = request.headers.host ?? TARGET.host;

  if (identity) {
    headers["x-dfri-eid-subject"] = headerSafe(identity.subject);
    headers["x-dfri-eid-subject-dn"] = headerSafe(identity.subjectDn);
    headers["x-dfri-eid-serial"] = headerSafe(identity.serial);
    headers["x-dfri-eid-issuer"] = headerSafe(identity.issuer);
    headers["x-dfri-eid-authorized"] = "true";
  }
  headers["x-forwarded-proto"] = request.socket.encrypted ? "https" : "http";
  headers["x-forwarded-host"] = request.headers.host ?? "";

  const upstream = httpRequest(
    {
      hostname: TARGET.hostname,
      port: TARGET.port || 80,
      path: request.url,
      method: request.method,
      headers,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );

  upstream.on("error", (error) => {
    console.error("Upstream error:", error.message);
    if (!response.headersSent) {
      response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    response.end("Bad gateway: the Next.js app is not reachable.");
  });

  request.pipe(upstream);
}

const publicServer = createHttpServer((request, response) => {
  proxy(request, response, null);
});

const secureServer = createHttpsServer(
  {
    key: readFileSync(SERVER_KEY_FILE),
    cert: readFileSync(SERVER_CERT_FILE),
    ca: readFileSync(CA_FILE),
    requestCert: true,
    // Do not abort the TLS handshake for missing/invalid client certificates;
    // decide per request so the prototype can respond with a useful message.
    rejectUnauthorized: false,
  },
  (request, response) => {
    const identity = identityFromSocket(request.socket);
    if (!identity && request.url?.startsWith("/internal")) {
      response.writeHead(401, { "content-type": "text/html; charset=utf-8" });
      response.end(
        "<h1>DFRI-eID certificate required</h1>" +
          "<p>No valid client certificate was presented. Use the test certificate " +
          "generated by <code>tools/dfri-verifier/generate-test-certs.sh</code>, " +
          "or open the public login page at <code>http://localhost:" +
          PUBLIC_PORT +
          "/internal/login</code>.</p>",
      );
      return;
    }
    proxy(request, response, identity);
  },
);

publicServer.listen(PUBLIC_PORT, () => {
  console.log(`DFRI verifier: public  http://localhost:${PUBLIC_PORT} -> ${TARGET.href}`);
});
secureServer.listen(SECURE_PORT, () => {
  console.log(
    `DFRI verifier: secure  https://localhost:${SECURE_PORT} -> ${TARGET.href} (client cert required for /internal)`,
  );
  console.log(`Trusted CA: ${CA_FILE}`);
});
