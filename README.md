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