#!/usr/bin/env bash
# Generate a throwaway test CA, server certificate and client certificate for the
# DFRI-eID login prototype. Run this from WSL (or any Linux/macOS shell with
# openssl), because the Windows host in this project does not have openssl.
#
#   wsl -d Ubuntu -e bash /mnt/c/Users/timsa/OneDrive/Dokument/friendsofhilma_website/tools/dfri-verifier/generate-test-certs.sh
#
# Output: tools/dfri-verifier/certs/ (gitignored)
# TEST ONLY. Never use these certificates or CA for production.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$DIR/certs"
mkdir -p "$OUT"
cd "$OUT"

if [ -e root-ca.key.pem ]; then
  echo "Certificates already exist in $OUT"
  echo "Delete that directory if you want to regenerate them."
  exit 0
fi

echo "Generating test root CA..."
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout root-ca.key.pem -out root-ca.crt.pem -days 3650 -sha256 \
  -subj "/C=SE/O=Friends of Hilma Test/CN=Friends of Hilma Test Root CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

echo "Generating test issuing CA..."
openssl req -newkey rsa:2048 -nodes \
  -keyout issuing-ca.key.pem -out issuing-ca.csr.pem \
  -subj "/C=SE/O=Friends of Hilma Test/CN=Friends of Hilma Test Issuing CA"
openssl x509 -req -in issuing-ca.csr.pem \
  -CA root-ca.crt.pem -CAkey root-ca.key.pem -CAcreateserial \
  -out issuing-ca.crt.pem -days 1825 -sha256 \
  -extfile <(printf "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\n")

echo "Generating localhost server certificate..."
openssl req -newkey rsa:2048 -nodes \
  -keyout server.key.pem -out server.csr.pem \
  -subj "/C=SE/O=Friends of Hilma Test/CN=localhost"
openssl x509 -req -in server.csr.pem \
  -CA issuing-ca.crt.pem -CAkey issuing-ca.key.pem -CAcreateserial \
  -out server.crt.pem -days 825 -sha256 \
  -extfile <(printf "subjectAltName=DNS:localhost,IP:127.0.0.1\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n")

echo "Generating test client certificate..."
CLIENT_ID="test-person-001"
openssl req -newkey rsa:2048 -nodes \
  -keyout "$CLIENT_ID.key.pem" -out "$CLIENT_ID.csr.pem" \
  -subj "/C=SE/O=Friends of Hilma Test/CN=$CLIENT_ID"
openssl x509 -req -in "$CLIENT_ID.csr.pem" \
  -CA issuing-ca.crt.pem -CAkey issuing-ca.key.pem -CAcreateserial \
  -out "$CLIENT_ID.crt.pem" -days 365 -sha256 \
  -extfile <(printf "keyUsage=critical,digitalSignature\nextendedKeyUsage=clientAuth\n")

echo "Building verification bundles..."
cat server.crt.pem issuing-ca.crt.pem > server-chain.crt.pem
cat issuing-ca.crt.pem root-ca.crt.pem > ca-bundle.crt.pem

echo "Packaging client certificate as .p12 (password: test)..."
openssl pkcs12 -export -out "$CLIENT_ID.p12" \
  -inkey "$CLIENT_ID.key.pem" -in "$CLIENT_ID.crt.pem" \
  -certfile issuing-ca.crt.pem \
  -passout pass:test

# Remove CSRs; keep the certificates and keys for the local prototype.
rm -f ./*.csr.pem ./*.srl

echo
echo "Done. Test files in: $OUT"
echo "  Client cert (curl):  $CLIENT_ID.crt.pem + $CLIENT_ID.key.pem"
echo "  Browser import:      $CLIENT_ID.p12 (password: test)"
echo
echo "Start the verifier:"
echo "  node tools/dfri-verifier/verifier.mjs"
echo "Then open:"
echo "  http://localhost:8080/internal/login   (public help page)"
echo "  https://localhost:8443/internal        (select the test certificate)"
