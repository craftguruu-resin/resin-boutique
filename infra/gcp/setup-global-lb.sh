#!/usr/bin/env bash
# Global HTTPS Load Balancer → Serverless NEG → Cloud Run (asia-south1)
# Run once: ./infra/gcp/setup-global-lb.sh
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-craft-guru-production}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${GCP_SERVICE:-craftguru-api}"
PREFIX="${LB_PREFIX:-craftguru}"

NEG="${PREFIX}-serverless-neg"
BACKEND="${PREFIX}-api-backend"
URL_MAP="${PREFIX}-url-map"
SSL_CERT="${PREFIX}-ssl-cert"
HTTPS_PROXY="${PREFIX}-https-proxy"
HTTP_REDIRECT_MAP="${PREFIX}-http-redirect"
HTTP_PROXY="${PREFIX}-http-proxy"
GLOBAL_IP="${PREFIX}-global-ip"
HTTPS_RULE="${PREFIX}-https-forwarding-rule"
HTTP_RULE="${PREFIX}-http-forwarding-rule"

DOMAINS="craftguruindia.com,www.craftguruindia.com,craftguru.co.in,www.craftguru.co.in"

gcloud config set project "$PROJECT_ID"

echo "==> Enabling APIs..."
for api in \
  compute.googleapis.com \
  certificatemanager.googleapis.com \
  networkservices.googleapis.com; do
  gcloud services enable "$api" --project="$PROJECT_ID" --quiet
  echo "  enabled $api"
done

echo "==> Serverless NEG..."
if ! gcloud compute network-endpoint-groups describe "$NEG" --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  gcloud compute network-endpoint-groups create "$NEG" \
    --region="$REGION" \
    --network-endpoint-type=serverless \
    --cloud-run-service="$SERVICE" \
    --project="$PROJECT_ID"
else
  echo "  exists: $NEG"
fi

echo "==> Backend service..."
if ! gcloud compute backend-services describe "$BACKEND" --global --project="$PROJECT_ID" &>/dev/null; then
  gcloud compute backend-services create "$BACKEND" \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --global \
    --protocol=HTTP \
    --port-name=http \
    --timeout=30s \
    --connection-draining-timeout=60 \
    --project="$PROJECT_ID"
else
  echo "  exists: $BACKEND"
fi

if ! gcloud compute backend-services describe "$BACKEND" --global --project="$PROJECT_ID" --format="value(backends)" | grep -q "$NEG"; then
  gcloud compute backend-services add-backend "$BACKEND" \
    --global \
    --network-endpoint-group="$NEG" \
    --network-endpoint-group-region="$REGION" \
    --project="$PROJECT_ID"
fi

echo "==> CDN + compression on backend..."
gcloud compute backend-services update "$BACKEND" \
  --global \
  --enable-cdn \
  --cache-mode=USE_ORIGIN_HEADERS \
  --compression-mode=AUTOMATIC \
  --negative-caching=false \
  --project="$PROJECT_ID"

echo "==> URL map..."
if ! gcloud compute url-maps describe "$URL_MAP" --global --project="$PROJECT_ID" &>/dev/null; then
  gcloud compute url-maps create "$URL_MAP" \
    --default-service="$BACKEND" \
    --global \
    --project="$PROJECT_ID"
else
  echo "  exists: $URL_MAP"
fi

echo "==> Managed SSL certificate..."
if ! gcloud compute ssl-certificates describe "$SSL_CERT" --global --project="$PROJECT_ID" &>/dev/null; then
  gcloud compute ssl-certificates create "$SSL_CERT" \
    --domains="$DOMAINS" \
    --global \
    --project="$PROJECT_ID"
else
  echo "  exists: $SSL_CERT"
fi

echo "==> HTTPS target proxy..."
if ! gcloud compute target-https-proxies describe "$HTTPS_PROXY" --global --project="$PROJECT_ID" &>/dev/null; then
  gcloud compute target-https-proxies create "$HTTPS_PROXY" \
    --url-map="$URL_MAP" \
    --ssl-certificates="$SSL_CERT" \
    --global \
    --project="$PROJECT_ID"
else
  echo "  exists: $HTTPS_PROXY"
fi

echo "==> Global static IP..."
if ! gcloud compute addresses describe "$GLOBAL_IP" --global --project="$PROJECT_ID" &>/dev/null; then
  gcloud compute addresses create "$GLOBAL_IP" \
    --global \
    --project="$PROJECT_ID"
else
  echo "  exists: $GLOBAL_IP"
fi

LB_IP="$(gcloud compute addresses describe "$GLOBAL_IP" --global --project="$PROJECT_ID" --format='value(address)')"
echo "  LB IP: $LB_IP"

echo "==> HTTPS forwarding rule (443)..."
if ! gcloud compute forwarding-rules describe "$HTTPS_RULE" --global --project="$PROJECT_ID" &>/dev/null; then
  gcloud compute forwarding-rules create "$HTTPS_RULE" \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --network-tier=PREMIUM \
    --address="$GLOBAL_IP" \
    --global \
    --target-https-proxy="$HTTPS_PROXY" \
    --ports=443 \
    --project="$PROJECT_ID"
else
  echo "  exists: $HTTPS_RULE"
fi

echo "==> HTTP → HTTPS redirect..."
if ! gcloud compute url-maps describe "$HTTP_REDIRECT_MAP" --global --project="$PROJECT_ID" &>/dev/null; then
  gcloud compute url-maps import "$HTTP_REDIRECT_MAP" --global --project="$PROJECT_ID" --source /dev/stdin <<EOF
name: ${HTTP_REDIRECT_MAP}
defaultUrlRedirect:
  httpsRedirect: true
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
EOF
else
  echo "  exists: $HTTP_REDIRECT_MAP"
fi

if ! gcloud compute target-http-proxies describe "$HTTP_PROXY" --global --project="$PROJECT_ID" &>/dev/null; then
  gcloud compute target-http-proxies create "$HTTP_PROXY" \
    --url-map="$HTTP_REDIRECT_MAP" \
    --global \
    --project="$PROJECT_ID"
else
  echo "  exists: $HTTP_PROXY"
fi

if ! gcloud compute forwarding-rules describe "$HTTP_RULE" --global --project="$PROJECT_ID" &>/dev/null; then
  gcloud compute forwarding-rules create "$HTTP_RULE" \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --network-tier=PREMIUM \
    --address="$GLOBAL_IP" \
    --global \
    --target-http-proxy="$HTTP_PROXY" \
    --ports=80 \
    --project="$PROJECT_ID"
else
  echo "  exists: $HTTP_RULE"
fi

echo ""
echo "==> Summary"
gcloud compute ssl-certificates describe "$SSL_CERT" --global --project="$PROJECT_ID" --format="yaml(name,managed.status,managed.domainStatus)"
echo ""
echo "Global IP: $LB_IP"
echo "Test (after DNS or Host header): curl -k -H 'Host: craftguruindia.com' https://$LB_IP/health"
