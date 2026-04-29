# Project Handover: That Laundry Shop (TLS)

## 📌 Project Overview
**Name:** that-laundry-shop
**Description:** A comprehensive web application for managing a laundry business. It includes an Admin Dashboard for managing operations (POS, CRM, Jobs, Riders) and a Rider application for delivery tracking.
**Framework:** Next.js 16.2.1 (App Router)
**Language:** TypeScript
**Styling:** Tailwind CSS v4 + Shadcn UI

## 🛠️ Tech Stack
- **Core:** React 19, Next.js 16
- **UI Components:** Shadcn UI (`@base-ui/react`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`)
- **Map & Location:** `leaflet`, `react-leaflet` (for live tracking and location input)
- **Animations:** `framer-motion`, `tw-animate-css`
- **Utilities:** `date-fns` (date handling), `sonner` (toast notifications), `use-debounce`

## 📂 Architecture & Implemented Features (Current State)

Based on the file structure, the following features have already been built:

### 1. Application Routes (`src/app/`)
- `/` - Main landing page (`page.tsx`)
- `/login` - Authentication/Login page
- `/admin` - Admin Portal
- `/rider` - Rider/Driver application view
- `/privacy` - Privacy policy page
- `/tools/poi-importer` - Bulk POI Importer with error handling and manual correction
- `/tools/map-converter` - Routing & Map coordinates conversion tools
- `/api/places` & `/api/map-convert` - Backend API routes for the hybrid location model

### 2. Admin Dashboard Components (`src/components/`)
The admin system is quite extensive and includes the following fully-built views:
- `admin-dashboard.tsx` (Main overview)
- `admin-pos.tsx` (Point of Sale system)
- `admin-crm.tsx` (Customer Relationship Management)
- `admin-all-jobs.tsx` & `admin-task-tracker.tsx` (Order/Job management)
- `admin-riders.tsx` & `admin-live-map.tsx` (Rider management and map tracking)
- `admin-service-menu.tsx` (Laundry services and pricing)
- `admin-settings.tsx` (System settings)

### 3. Map Features (`src/components/`)
- `map-component.tsx`, `map-loader.tsx`
- `create-job-map.tsx` (Map for creating/assigning new jobs)
- `location-input.tsx` (Address/Location input fields)

### 4. State Management & API (`src/lib/`)
- `store.ts` - Likely using Zustand or Context for global state.
- `api.ts`, `map-api.ts` - Logic for fetching data and map services.
- `use-customers.ts`, `use-jobs.ts`, `use-riders.ts` - Custom React hooks for data fetching and state management.

### 5. Security & Auth
- `protected-route.tsx` in components, ensuring only authorized users can access specific pages (like `/admin`).

### 6. Recent Updates: Location Management (Hybrid Model)
- **Bulk POI Importer (`/tools/poi-importer`):** Built with robust error handling and manual correction features.
- **Cost-Effective Routing (`/tools/map-converter`):** Refined the routing calculation profile to accurately support motorcycle transit.
- **System-Wide API Toggle:** Implemented a system-wide toggle in `admin-settings.tsx` to enable/disable Google Maps API usage for cost control.
- **Hybrid API Architecture:** Integrated `map-api.ts` and new API routes to seamlessly fallback to OpenStreetMap/Leaflet and standard routing engines when Google Maps is disabled.

## 🚀 How to continue work
When continuing on a new machine with the AI Agent:
1. Provide the agent with this `PROJECT_HANDOVER.md` file.
2. Run `npm install` to install all dependencies.
3. Run `npm run dev` to start the development server.
4. Let the agent know what specific feature you want to build next (e.g., "Add a new feature to the POS system", "Connect the login page to a real database", or "Enhance the Rider app interface").
