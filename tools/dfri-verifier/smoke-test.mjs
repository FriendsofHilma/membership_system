#!/usr/bin/env node
/**
 * Smoke test for the DFRI-eID verifier prototype.
 *
 * Assumes the Next.js dev server (port 3000) and verifier.mjs (ports 8080/8443)
 * are already running, and that generate-test-certs.sh has created certs/.
 *
 *   node tools/dfri-verifier/smoke-test.mjs
 */

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CERTS = resolve("tools/dfri-verifier/certs");
const results = [];

function httpGet({ url, cert, key, ca }) {
  return new Promise((resolvePromise, reject) => {
    const isHttps = url.startsWith("https:");
    const requestFn = isHttps ? httpsRequest : httpRequest;
    const req = requestFn(
      url,
      {
        method: "GET",
        ...(cert ? { cert: readFileSync(cert) } : {}),
        ...(key ? { key: readFileSync(key) } : {}),
        ...(ca ? { ca: readFileSync(ca) } : {}),
        rejectUnauthorized: Boolean(ca),
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolvePromise({ status: res.statusCode, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const publicLogin = await httpGet({ url: "http://localhost:8080/internal/login" });
  check("public login page is reachable", publicLogin.status === 200, `HTTP ${publicLogin.status}`);

  const publicInternal = await httpGet({ url: "http://localhost:8080/internal" });
  check(
    "public /internal redirects to login",
    publicInternal.status === 307 &&
      String(publicInternal.headers.location ?? "").includes("/internal/login"),
    `HTTP ${publicInternal.status} -> ${publicInternal.headers.location ?? "no location"}`,
  );

  const secureWithoutCert = await httpGet({ url: "https://localhost:8443/internal" });
  check(
    "secure /internal without a cert is rejected",
    secureWithoutCert.status === 401,
    `HTTP ${secureWithoutCert.status}`,
  );

  const secureWithCert = await httpGet({
    url: "https://localhost:8443/internal",
    cert: `${CERTS}/test-person-001.crt.pem`,
    key: `${CERTS}/test-person-001.key.pem`,
    ca: `${CERTS}/ca-bundle.crt.pem`,
  });
  check(
    "secure /internal with a trusted cert is allowed",
    secureWithCert.status === 200,
    `HTTP ${secureWithCert.status}`,
  );
  check(
    "verified identity is shown on the page",
    secureWithCert.body.includes("test-person-001") &&
      secureWithCert.body.includes("Authenticated via verified client certificate"),
    "body contains subject and success text",
  );

  const directNext = await httpGet({ url: "http://localhost:3000/internal" });
  check(
    "direct Next.js access redirects to login",
    directNext.status === 307 &&
      String(directNext.headers.location ?? "").includes("/internal/login"),
    `HTTP ${directNext.status} -> ${directNext.headers.location ?? "no location"}`,
  );

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Smoke test error:", error.message);
  process.exitCode = 1;
});
