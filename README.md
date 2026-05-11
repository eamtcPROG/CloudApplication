# AC
Repository for cloud application course

## Requirements

1. This project should be made to run as a Docker image.
2. Docker image should be published to a Docker registry.
3. Docker image should be deployed to a Kubernetes cluster.
4. Kubernetes cluster should be running on a cloud provider.
5. Kubernetes cluster should be accessible from the internet.
6. Kubernetes cluster should be able to scale the application.
7. Kubernetes cluster should be able to update the application without downtime.
8. Kubernetes cluster should be able to rollback the application to a previous version.
9. Kubernetes cluster should be able to monitor the application.
10. Kubernetes cluster should be able to autoscale the application based on the load.

## Additional
1. Application logs should be stored in a centralised logging system (Loki, Kibana, etc.)
2. Application should be able to send metrics to a monitoring system.
3. Database should be running on a separate container.
4. Storage should be mounted to the database container.

## Docker

Paths below assume the repository root as the current working directory.

### Build

```bash
docker build -t ac-api:latest -f api/Dockerfile api
```

### Run

Runtime configuration (`PORT`, `NODE_ENV`, and any future variables) is supplied at release time—not baked into the image.

```bash
docker run --rm -p 3000:3000 -e NODE_ENV=production -e PORT=3000 ac-api:latest
```

Set `PORT` and `NODE_ENV` here, in Compose, or in Kubernetes; do not rely on them being defined only at image build.

### Smoke check

```bash
curl http://localhost:3000
```

### Publish to a registry

This satisfies requirement (2) above. After `docker login` to your registry, tag the local image and push. Replace `YOUR_REGISTRY/YOUR_REPO` and `TAG` (for example `0.0.1` or your Git commit SHA).

```bash
docker tag ac-api:latest YOUR_REGISTRY/YOUR_REPO:TAG
docker push YOUR_REGISTRY/YOUR_REPO:TAG
```

`YOUR_REGISTRY` might be Docker Hub (`username/repo`), GitHub Container Registry (`ghcr.io/org/repo`), or a cloud provider registry.

In this project the image is published publicly to Docker Hub at [`eamtc/cloud_application`](https://hub.docker.com/r/eamtc/cloud_application). New tags are built and pushed by the GitHub Actions workflow described below — manual `docker push` is only needed for the very first image or for local experiments.

## Deploying to GKE (Google Kubernetes Engine)

This section is an end-to-end guide for putting the API on a production-style Kubernetes cluster in Google Cloud, with a GitHub Actions pipeline doing the build/push/deploy on every git tag. It maps every numbered requirement above to a concrete artifact — see the table in section L.

### What you'll build

Two independent GitHub Actions workflows. Building publishes the image; deploying rolls a chosen tag out to GKE. They are intentionally decoupled so you can build without deploying, deploy without rebuilding, or roll back instantly.

```
                  build.yml                               deploy.yml
                  ─────────                               ──────────
git tag v0.0.2 ─▶ docker build api/         (manual run with tag input)
                  docker push                            │
                  docker.io/eamtc/                       ▼
                  cloud_application:v0.0.2  kubectl apply -f k8s/
                                            kubectl set image …:<tag>
                                                         │
                                                         ▼
                                  Internet ─▶ GCP LoadBalancer
                                              └─▶ GKE Autopilot (ac-cluster)
                                                  └── ns: ac
                                                       └── api Deployment
                                                           (replicas≥2, HPA 2→5,
                                                            RollingUpdate)
                                  Cloud Logging + Cloud Monitoring (automatic)
```

This deploy is intentionally **stateless** — there is no database in the cluster. The additional requirements 3 and 4 (DB in a separate container, mounted storage) are not addressed by this guide.

### Choices made (and the tradeoffs)

| Decision | Why this | What we give up |
|---|---|---|
| **GKE Autopilot** (not Standard) | Google manages nodes, node autoscaling is built-in, billing per-pod | No custom node pools, less low-level control |
| **`Service: LoadBalancer`** (not Ingress) | One YAML, public IP in ~60s — fastest path to requirement 5 | No L7 routing, no managed TLS (upgrade: Ingress + ManagedCertificate) |
| **Service Account JSON key for GHA auth** (not Workload Identity Federation) | Two commands to set up, one secret to paste | A long-lived credential lives in GitHub secrets — rotate periodically; production should use WIF |
| **Stateless deploy — no database** | Keeps the moving parts to a minimum; the API today doesn't need persistence | Additional requirements 3 & 4 are not addressed — add a managed DB (Cloud SQL) or an in-cluster StatefulSet when persistence is needed |

### A. Prerequisites

Local tools: `gcloud` (Google Cloud SDK), `kubectl`, optionally `helm` and [`hey`](https://github.com/rakyll/hey) for the load-test demo.

GCP setup: a project with billing linked, a chosen region (this guide uses `europe-west1`), and a Docker Hub account with an [access token](https://hub.docker.com/settings/security).

Define shell variables once (used in the manual setup steps; the pipeline reads its own from secrets):

```bash
export PROJECT_ID=cloud-application-utm
export REGION=europe-west1
export CLUSTER=ac-cluster
export DOCKER_REPO=eamtc/cloud_application
```

Authenticate and enable the APIs the rest of the guide needs:

```bash
gcloud auth login
gcloud config set project "$PROJECT_ID"
gcloud services enable \
  container.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  compute.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com
```

### B. Create the GKE cluster (requirements 3, 4)

Autopilot creates a regional, node-autoscaled cluster. Provisioning takes ~5–8 minutes.

Install the GKE kubectl auth plugin once so `kubectl` can use credentials from `get-credentials`:

```bash
gcloud components install gke-gcloud-auth-plugin

gcloud container clusters create-auto "$CLUSTER" \
  --region="$REGION" \
  --release-channel=regular

gcloud container clusters get-credentials "$CLUSTER" --region="$REGION"

kubectl cluster-info

kubectl get nodes        # sanity check
```

### C. Create the deploy service account (for GitHub Actions)

The pipeline needs a credential to call `gcloud container clusters get-credentials`. We grant only `roles/container.developer` — enough to deploy, not enough to manage the cluster.

```bash
export SA_NAME=github-deployer
export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions deploy SA"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/container.developer"

gcloud iam service-accounts keys create gha-key.json \
  --iam-account="$SA_EMAIL"
```

Paste the entire contents of `gha-key.json` into the `GCP_SA_KEY` GitHub secret (next step), then delete the local file. It is a long-lived credential — do not commit it.

### D. Add GitHub Actions secrets

In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**. Add each of:

| Secret | Value |
|---|---|
| `DOCKERHUB_USERNAME` | `eamtc` |
| `DOCKERHUB_TOKEN` | Docker Hub access token (see Prerequisites) |
| `GCP_PROJECT_ID` | Your GCP project ID |
| `GCP_REGION` | `europe-west1` (or your chosen region) |
| `GKE_CLUSTER` | `ac-cluster` |
| `GCP_SA_KEY` | Full JSON contents of `gha-key.json` |

### E. Kubernetes manifests (`k8s/`)

The cluster's desired state lives under [`k8s/`](k8s):

| File | Purpose |
|---|---|
| [`k8s/namespace.yaml`](k8s/namespace.yaml) | Isolates everything in the `ac` namespace |
| [`k8s/api-configmap.yaml`](k8s/api-configmap.yaml) | Runtime env: `PORT`, `NODE_ENV` |
| [`k8s/api-deployment.yaml`](k8s/api-deployment.yaml) | API workload, 2 replicas, rolling update, readiness/liveness on `/health` |
| [`k8s/api-service.yaml`](k8s/api-service.yaml) | `LoadBalancer` — public IP on port 80 → pod port 3000 (req. 5) |
| [`k8s/api-hpa.yaml`](k8s/api-hpa.yaml) | CPU-based HPA, min 2 / max 5 (req. 10) |

Why the key fields matter:

- **`strategy: RollingUpdate` with `maxUnavailable: 0` + `maxSurge: 1`** in the Deployment, combined with a readiness probe and ≥2 replicas, is what makes updates zero-downtime (requirement 7). New pods only receive traffic after `/health` returns 200; old pods stay in rotation until then.
- **`readinessProbe` / `livenessProbe` on `/health`** — readiness gates Service traffic; liveness restarts a hung pod. Both are required for production-grade rolling updates.
- **`resources.requests`** are mandatory on Autopilot and are what the HPA reads as the "100%" baseline for CPU utilisation.
- **`HorizontalPodAutoscaler` on CPU `averageUtilization: 60`** — when sustained CPU goes above 60% of the request, pods scale up. On Autopilot, if pod demand exceeds node capacity, the platform autoscaler adds nodes automatically. One manifest, both layers of scaling.
- **`securityContext: runAsNonRoot, readOnlyRootFilesystem, allowPrivilegeEscalation: false, drop ALL`** — Autopilot's admission controller rejects pods that don't set these.

To apply everything in one go (the pipeline does this automatically):

```bash
kubectl apply -f k8s/
```

### F. Application changes that landed for this guide

Two small code changes were needed before any pod could pass readiness:

1. **`GET /health` endpoint** — added to [api/src/app.controller.ts](api/src/app.controller.ts). Returns `{ status: "ok" }`. The kubelet calls it every 5s for readiness and every 20s for liveness. Idiomatic upgrade: `@nestjs/terminus` with DB and HTTP indicators.
2. **`PORT` fallback fix** — [api/src/configuration.ts](api/src/configuration.ts) now defaults to `"3000"` when the env var is unset. Previously it produced `NaN`, and `app.listen(NaN)` crashed the pod at startup. The ConfigMap sets `PORT` so the bug was masked in the happy path, but the code is now resilient.

### G. The GitHub Actions workflows

The CI/CD is split into two independent workflows. The split means a build never auto-deploys — pushing a tag publishes an artifact, and you decide separately when (and which tag) to roll out.

#### G.1 — Build & push ([`.github/workflows/build.yml`](.github/workflows/build.yml))

**Triggers**:

- **Push a `v*` tag** — builds the image from that commit, pushes it to Docker Hub as both `:<tag>` and `:latest`. This is the normal release path.
- **Manual run** (`workflow_dispatch`) — type any tag name (e.g. a feature branch name); the image is built from the current branch's `api/` and pushed under that tag. Useful for testing without creating a git tag.

**Steps**: `actions/checkout@v4` → `docker/setup-buildx-action@v3` (BuildKit caching) → `docker/login-action@v3` (consumes `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN`) → `docker/build-push-action@v6` with `--platform linux/amd64` (GKE Autopilot is amd64) → pushes both `:<tag>` and `:latest`. GHA cache shaves ~80% off subsequent builds.

Nothing in this workflow touches GKE.

#### G.2 — Deploy ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml))

**Trigger**: **manual only** (`workflow_dispatch`). The single input is `tag` — the Docker Hub tag to roll out, e.g. `v0.0.1`, `v0.0.2`, `latest`, or any tag the build workflow has published. Type it in the Actions tab and run.

**Steps**: `actions/checkout@v4` (to read [`k8s/`](k8s)) → `google-github-actions/auth@v2` (consumes `GCP_SA_KEY`) → `setup-gcloud@v2` puts `gcloud` on PATH → `gcloud components install gke-gcloud-auth-plugin` (required since Kubernetes 1.26) → `gcloud container clusters get-credentials` writes the kubeconfig → `kubectl apply -f k8s/` reconciles the API manifests → `kubectl set image` rolls the chosen tag out → `kubectl rollout status` blocks until the new ReplicaSet is healthy.

**Failure mode**: if any pod fails its readiness probe, `rollout status` times out and the workflow goes red. Because `maxUnavailable: 0`, the prior version keeps serving traffic the whole time — bad releases never take the site down.

**Common flows**:

| Goal | What you do |
|---|---|
| Release a new version | `git tag v0.0.3 && git push origin v0.0.3` (build runs) → manually run **Deploy** with `tag=v0.0.3` |
| Roll back to a previous version | Run **Deploy** with `tag=v0.0.1` — Docker Hub still has it; no rebuild |
| Redeploy after editing a manifest | Run **Deploy** with the same tag — the `kubectl apply` step picks up the change |
| Try a branch in the cluster | Manually run **Build** with `tag=feat-x`, then **Deploy** with `tag=feat-x` |

### H. First-run verification (requirements 3, 5)

Push a tag from your local clone — this triggers **build.yml** only:

```bash
git tag v0.0.1
git push origin v0.0.1
```

Watch the **Actions** tab; once the build is green, run **Deploy to GKE** manually from the Actions tab with `tag=v0.0.1`. Once that finishes green:

```bash
export EXTERNAL_IP=$(kubectl -n ac get svc api -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl "http://$EXTERNAL_IP"          # → Hello World!
curl "http://$EXTERNAL_IP/health"   # → {"status":"ok"}
```

Troubleshooting:

```bash
kubectl -n ac describe pod <pod>                       # ImagePullBackOff, OOMKilled, etc.
kubectl -n ac logs <pod>                               # application errors
kubectl -n ac get events --sort-by=.lastTimestamp      # Autopilot admission rejections
```

### I. Scaling, rolling updates, rollback (requirements 6, 7, 8, 10)

**Manual scaling (requirement 6):**

```bash
kubectl -n ac scale deployment/api --replicas=4
kubectl -n ac get pods
```

**Autoscaling on load (requirement 10):**

```bash
kubectl -n ac get hpa             # see CURRENT/TARGET CPU
hey -z 2m -c 50 "http://$EXTERNAL_IP/"   # in another shell, generate load
kubectl -n ac get hpa -w          # watch replicas climb 2 → 3 → … → 5
```

If pod demand exceeds node capacity, Autopilot adds nodes within ~60–90 seconds.

**Zero-downtime update (requirement 7):**

```bash
git tag v0.0.2 && git push origin v0.0.2     # build.yml builds & pushes
# then trigger Deploy with tag=v0.0.2 from the Actions tab.
# in parallel, prove no 5xx during the rollout:
while true; do curl -s -o /dev/null -w "%{http_code}\n" "http://$EXTERNAL_IP"; sleep 0.2; done
```

You should see only `200`s. The combination of `maxUnavailable: 0`, the readiness probe, and ≥2 replicas guarantees that new pods enter the Service's endpoints only after they're serving, and old pods stay until then.

**Rollback (requirement 8):**

```bash
kubectl -n ac rollout history deployment/api          # list revisions
kubectl -n ac rollout undo deployment/api             # roll to previous
kubectl -n ac rollout status deployment/api
```

Alternative (CI-driven rollback): trigger the **Deploy to GKE** workflow from the Actions tab with `tag=v0.0.1`. Docker Hub still has the image, so no rebuild happens — the deploy job just rolls the cluster back. This is also the safe way to redeploy after editing a manifest.

### J. Monitoring & logging (requirement 9, additional 1 & 2)

**Cloud Logging (additional 1).** Every container's stdout/stderr is shipped automatically — no agent install. View in the Console under **Logging → Logs Explorer**, or from the CLI:

```bash
gcloud logging read \
  'resource.type="k8s_container" AND resource.labels.namespace_name="ac"' \
  --limit 20 --format=json
```

**Cloud Monitoring (requirement 9).** **Kubernetes Engine → Workloads** in the Console gives per-pod CPU, memory, restart-count, and request-latency dashboards out of the box. Worth adding: an Uptime Check against `http://$EXTERNAL_IP/health` with an alert policy.

**Optional self-hosted stack (additional 1 & 2).** If you want Loki by name (the requirements list mentions it) or a Prometheus you control:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana              https://grafana.github.io/helm-charts
helm install kps  prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
helm install loki grafana/loki-stack -n monitoring
kubectl -n monitoring port-forward svc/kps-grafana 3001:80   # Grafana UI on localhost:3001
```

**Custom metrics (additional 2).** Install `prom-client` and `@willsoto/nestjs-prometheus`, expose `/metrics`, and add a `ServiceMonitor` CR so kube-prometheus-stack scrapes the API. Three-line `module.imports` change in NestJS; documentation [here](https://github.com/willsoto/nestjs-prometheus).

### K. Cleanup

GKE Autopilot, the LoadBalancer, and the Persistent Disk all bill while idle. Tear down in this order — deleting the namespace first releases the LB IP and the PD before the cluster goes, which avoids orphan resources that still bill:

```bash
kubectl delete namespace ac
gcloud container clusters delete "$CLUSTER" --region="$REGION" --quiet
gcloud iam service-accounts delete "$SA_EMAIL" --quiet
```

Also remove the six GitHub Actions secrets when you're done with the project.

### L. Requirements traceability

| # | Requirement | Satisfied by | Section / file |
|---|---|---|---|
| 1 | Docker image built | [`api/Dockerfile`](api/Dockerfile) + GHA build step | existing / G |
| 2 | Image pushed to a registry | Docker Hub `eamtc/cloud_application` via GHA | G |
| 3 | Deployed to Kubernetes | `kubectl apply` in GHA | E, G, H |
| 4 | Cluster on cloud provider | GKE Autopilot | B |
| 5 | Internet-accessible | `Service type: LoadBalancer` | [`k8s/api-service.yaml`](k8s/api-service.yaml), H |
| 6 | Can scale the app | `replicas`, `kubectl scale`, HPA | [`k8s/api-deployment.yaml`](k8s/api-deployment.yaml), [`k8s/api-hpa.yaml`](k8s/api-hpa.yaml), I |
| 7 | No-downtime updates | `RollingUpdate maxUnavailable: 0` + `/health` readiness | [`k8s/api-deployment.yaml`](k8s/api-deployment.yaml), I |
| 8 | Rollback | `kubectl rollout undo` / re-run `workflow_dispatch` | I |
| 9 | Monitoring | Cloud Monitoring (auto) + optional `kube-prometheus-stack` | J |
| 10 | Autoscaling on load | HPA + Autopilot node autoscaler | [`k8s/api-hpa.yaml`](k8s/api-hpa.yaml), I |
| A1 | Centralised logs | Cloud Logging (auto) + optional Loki | J |
| A2 | Metrics → monitoring | Cloud Monitoring (auto) + optional `prom-client` | J |
| A3 | DB in separate container | **Not addressed** — deploy is stateless by design | — |
| A4 | Storage mounted to DB | **Not addressed** — no database in this deploy | — |