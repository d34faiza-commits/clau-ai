# clau-ai

Modern Web Server Control Panel — Next.js (App Router) + Tailwind CSS + lucide-react.

## Menjalankan

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start   # production
```

## Struktur

```
app/
  layout.tsx       # root layout: Sidebar + konten
  page.tsx         # halaman Dashboard
  globals.css
components/
  Sidebar.tsx      # navigasi kiri (collapsible, responsive)
  ServerTime.tsx   # jam UTC live (client component)
```

Tahap 1: Dashboard (data masih statis).
