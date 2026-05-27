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

---

## 💡 Developer Guidelines: Branching, Hotfixing & Database Migrations

Always follow these guidelines when adding features or fixing bugs to prevent disrupting the live production environment.

### 1. Git Branching Strategy
* **`main` (Production):** The stable production branch. **Strictly no direct feature development on this branch.** Only stable hotfixes can be merged here.
* **`develop` (Staging):** The main branch for developing new features.
* **`feature/<name>`:** Temporary branches branched out from `develop` for specific new features (e.g., `feature/new-billing-module`). Merge back to `develop` once verified.

### 2. Live Bug Hotfix Workflow (How to switch context safely)
If you are developing a new feature on `develop` (or a `feature` branch) on localhost, and a critical bug occurs on Production:
1. **Stash your incomplete work:** Save and hide your active feature work safely:
   ```bash
   git stash
   ```
2. **Switch to main & Pull latest:**
   ```bash
   git checkout main
   git pull origin main
   ```
3. **Create a hotfix branch:**
   ```bash
   git checkout -b hotfix/fix-critical-bug
   ```
4. **Fix & Verify on localhost:** Resolve the bug on localhost, test thoroughly, and push:
   ```bash
   git add .
   git commit -m "Fix critical bug in ..."
   git push origin hotfix/fix-critical-bug
   ```
5. **Merge to main & Deploy:** Create a PR to merge `hotfix/fix-critical-bug` into `main`. Once merged, the CI/CD pipeline will automatically deploy the fix to Production.
6. **Restore your feature work:**
   ```bash
   git checkout develop
   git stash pop
   git merge main   # Bring the hotfix changes into your feature branch to prevent regression
   ```

### 3. Database Schema Migration Workflow (Prisma Migrate)
If your new feature requires changing the database structure:
1. **Modify Schema:** Make your structural changes directly in `prisma/schema.prisma`.
2. **Create & Apply Migration (Staging/Local):** Run the following command to generate a SQL migration file and apply it to your Staging/Local database:
   ```bash
   npx prisma migrate dev --name <migration_name>
   ```
   *This automatically generates type definitions in Prisma Client.*
3. **Deploy to Production:** When deploying the new feature to the Production server, never run `migrate dev`. Run the following safe migration deployment command:
   ```bash
   npx prisma migrate deploy
   ```
   *This applies any pending migrations safely without risking data reset.*

### 4. Automated CI/CD Deployment Mapping
The project is configured with GitHub Actions to automatically deploy to **Google Cloud Run** upon pushing to specific branches. Do not run manual deployment scripts unless instructed:
* **Production:** Triggered automatically by pushing to the `main` branch.
* **Test Environment:** Triggered by merging `main` into the `test` branch and pushing to GitHub.
* **Staging Environment:** Triggered by merging `main` into the `staging` branch and pushing to GitHub.
