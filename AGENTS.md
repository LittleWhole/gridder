# Gridder Agent Notes

## Container workflow

- Preferred dependency/test workflow: run commands in the repo container once Docker is available.
- Build the image with `docker build -t gridder-dev .`.
- Run checks with `docker run --rm gridder-dev npm run build` or override the command as needed.
- Local fallback used on 2026-06-12: Docker was unavailable in this workspace (`docker: command not found`), so npm dependency updates and checks were run directly with Node.js.
