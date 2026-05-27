# That Laundry Shop (TLS) - Developer & Agent Guide

Welcome! This guide outlines the development commands and the standard deployment workflow for TLS. Read this first before starting any work.

## 🛠️ Development Commands
- **Local Dev Server:** `npm run dev` (starts the Next.js Turbopack development server on port 3000)
- **Production Build:** `npm run build` (builds the Next.js production bundle)
- **Linting:** `npm run lint` (runs ESLint checks)

---

## 🚀 Deployment & CI/CD Workflow
We deploy to Cloud Run automatically via GitHub Actions pipelines triggered by git pushes on specific branches. **Do not run local `gcloud` deploy scripts unless instructed.**

### 1. Production Deployment
Production is triggered by pushing changes directly to the `main` branch:
```bash
git checkout main
git add .
git commit -m "your commit message"
git push origin main
```

### 2. Test Environment Deployment
Test environment is deployed by fast-forward merging `main` into the `test` branch and pushing:
```bash
git checkout test
git merge main
git push origin test
git checkout main
```

### 3. Staging Environment Deployment
Staging environment is deployed by fast-forward merging `main` into the `staging` branch and pushing:
```bash
git checkout staging
git merge main
git push origin staging
git checkout main
```

---

## 📁 Key File Map
- **Customer Dialog/Registration:** `src/components/admin-customer-dialog.tsx`
- **Customer Profile Modal:** `src/components/admin-customer-profile-modal.tsx`
- **Rider Page:** `src/app/rider/page.tsx`
- **Database Schema:** `prisma/schema.prisma`
