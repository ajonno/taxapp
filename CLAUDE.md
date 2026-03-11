# Taxapp — Australian Tax Reporting Application

Personal tax reporting tool for Australian ATO compliance. Imports bank/broker transactions, categorises them against ATO tax codes, tracks CGT events, and generates PDF tax summary reports.

## Quick Start

```bash
npm run db:start        # Start local MongoDB (Homebrew)
npm run dev             # Start client (5173) + server (3001) concurrently
```

Other commands: `npm run db:stop`, `npm run install:all`, `npm run dev:client`, `npm run dev:server`

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript 5.9, Vite 7, React Router 7 |
| Backend | Express 4, TypeScript 5.7, Mongoose 8 |
| Database | MongoDB (local, `mongodb://localhost:27017/taxapp`) |
| PDF | PDFKit |
| CSV | csv-parse |
| Uploads | Multer |

No testing framework configured. No CI/CD pipeline.

## Project Structure

```
client/
  src/
    pages/          # Route-level components (Dashboard, Transactions, Import, etc.)
    components/     # Shared components (Layout, Attachments, FileBrowser)
    context/        # TaxYearContext (global tax year + entity filter state)
    App.tsx         # Router definition
    main.tsx        # Entry point
  *.css             # Co-located styles per component

server/
  src/
    index.ts        # Express app setup, CORS, route mounting (port 3001)
    config/db.ts    # MongoDB connection
    models/         # Mongoose schemas (Transaction, CGTAsset, Entity, Filter, etc.)
    routes/         # API handlers (transactions, import, reports, cgtAssets, etc.)
    parsers/        # CSV format parsers (Westpac, IG, IBKR)
  uploads/          # File storage (gitignored)
```

## Routes (Client)

| Path | Page | Purpose |
|---|---|---|
| `/` | Dashboard | Income/deduction summary, CGT overview |
| `/transactions` | Transactions | List, filter, categorise, paginate transactions |
| `/income` | Income | Manual income entries |
| `/cgt` | CGTAssets | Capital gains tax event tracking |
| `/import` | Import | CSV drag-drop import |
| `/filters` | Filters | Transaction exclusion patterns |
| `/settings` | Settings | Entity and source management |

## API Routes (Server)

All routes prefixed with `/api/`. Key endpoints:

- `GET/POST/PATCH/DELETE /api/transactions` — CRUD + bulk ops, filtering, pagination
- `POST /api/import` — CSV upload with format auto-detection
- `GET/POST/PATCH/DELETE /api/cgt-assets` — CGT event management + summary
- `GET/POST/PATCH/DELETE /api/income` — Manual income entries
- `GET/POST/DELETE /api/filters` — Exclusion filters
- `GET/POST/PATCH/DELETE /api/entities` — Business entities (seeded: Personal, AAMSCO)
- `GET/POST/PATCH/DELETE /api/sources` — Data sources (seeded: Westpac, IG, IBKR)
- `GET /api/tax-categories` — ATO category list (seeded: I1-I17, D1-D10)
- `GET /api/reports/tax-summary` — PDF generation
- `POST/DELETE /api/attachments` — File linking + directory browsing

## Data Models

**Transaction** — Core model. 14 types: `trading`, `dividend-trading`, `dividend-bank`, `fee-trading`, `fee-bank`, `cash-transfer-trading`, `cash-transfer-bank`, `adjustment-trading`, `adjustment-bank`, `bank`. Key fields: `source`, `sourceReference` (dedup key), `taxYear`, `amount`, `taxCategory`, `entity`, `followUp`. Trade-specific: `symbol`, `side`, `quantity`, `price`, `commission`, `subType`.

**CGTAsset** — Acquisition/disposal tracking with Mongoose virtuals: `totalCostBase`, `totalDisposalCosts`, `netProceeds`, `capitalGainLoss`, `heldOverOneYear`, `discountApplicable`, `netCapitalGain`. Types: property, shares, crypto, other.

**Entity** — Business entities with `name`, `type` (personal/company/trust/smsf).

**Source** — Import sources with `name`, `type` (bank/broker).

**Filter** — Exclusion patterns with `field`, `pattern`, `matchType` (contains/exact/startsWith/regex).

**Income** — Manual entries with `type` (salary/interest/dividends/rental/other/foreignIncome/governmentPayments).

**TaxCategory** — ATO codes. Income: I1 (salary) through I17 (other). Deductions: D1 through D10.

## CSV Import Formats

1. **Westpac** — `Bank Account,Date,Narrative,Debit Amount,Credit Amount,Balance,Categories,Serial`. Date: DD/MM/YYYY.
2. **IG Markets** — Two variants auto-detected:
   - CFD format: `TextDate,Summary,MarketName,...`
   - Trade history: `TextDate,Time,Activity,Market,Direction,Quantity,Price,...`
3. **Interactive Brokers (IBKR)** — Prefixed rows: `Transaction History,Header,...` / `Transaction History,Data,...`. Maps Buy/Sell/Dividend/Adjustment to transaction types.

Import uses hash-based `sourceReference` for deduplication and learns category/entity assignments from prior imports.

## Features

### Global Layout & Navigation
- Sidebar with nav links to all pages (Dashboard, Transactions, Income, CGT Assets, Import, Filters, Settings)
- Global **tax year selector** in sidebar — filters data across all pages via `TaxYearContext`
- Global **entity selector** in sidebar — filters by business entity across all pages
- Tax year format: `FY 2024-25` (Australian financial year Jul-Jun, stored as end year e.g. `2025`)
- Selections persisted in `localStorage` across sessions
- Mobile responsive: collapsible sidebar with hamburger toggle and overlay

### Dashboard (`/`)
- **Income summary table** — categorised transaction totals by ATO code (I1-I17), plus manual income entries and net CGT
- **Deductions summary table** — categorised transaction totals by ATO deduction code (D1-D10)
- **Capital gains card** — total gains, total losses, net capital gain (after 50% discount)
- **Net income footer** — income minus deductions
- **Uncategorised count** — shows count and total for transactions without a tax category
- Clickable rows — clicking a category navigates to Transactions filtered by that `taxCategory`
- **PDF Report button** — opens `/api/reports/tax-summary` in new tab, generates A4 PDF with:
  - Income section with all categorised transactions + manual income + CGT
  - Deductions section
  - Taxable income calculation (highlighted box)
  - Per-asset CGT event detail (acquisition, disposal, cost base items, discount info)

### Transactions (`/transactions`)
- **Paginated table** — 50 per page, shows date, category, entity, type, sub-type, source, description, amount
- **Filtering**: source, type (multi-select checkbox dropdown), sub-type, tax category (with "Uncategorised" option), text search on description, follow-up only toggle, entity (global)
- **Exclusion filters toggle** — "Apply Filters: On/Off" controls whether filter patterns hide matching transactions
- **Type summary chips** — shows count per transaction type above the table for current filter results
- **Total row** — footer shows sum of all matching transactions (not just current page)
- **Inline category assignment** — dropdown per row to set ATO tax category; applies to all transactions with the same description
- **Inline entity assignment** — dropdown per row; applies to all transactions with same source + description
- **Follow-up flag** — toggle per row, highlights row yellow; toggles all transactions with same description
- **Ignore button** — creates an exclusion filter from transaction description (with optional pattern editing via prompt dialog, controlled by "Confirm ignore" checkbox)
- **Delete** — single transaction delete with confirmation
- **Bulk delete** — "Delete All (N)" deletes all transactions matching current filters with confirmation
- **Undo stack** — `useRef`-based stack for category changes, entity changes, follow-up toggles, and ignore actions; supports Cmd+Z / Ctrl+Z keyboard shortcut; shows most recent undoable action label
- **File attachments** — expandable "Attach" button per row opens Attachments component
- **URL param support** — `?taxCategory=X` pre-sets category filter (used by Dashboard click-through)
- Color-coded badges for transaction types and sub-types (Buy/Sell/Dividend/Adjustment)
- Positive amounts green, negative amounts red

### CSV Import (`/import`)
- **Source selector** — dropdown of configured sources with context-specific hints (e.g. "use Trade History CSV" for IG)
- **Entity selector** — assigns entity to all imported transactions
- **Account label** — optional text field for labelling the account (e.g. "Westpac Everyday")
- **Drag-and-drop zone** — accepts .csv files, shows filename and size
- **Import results panel** — shows total rows, imported count, duplicates skipped, auto-categorised (learned) count, and any errors
- **Format auto-detection** by source:
  - Westpac: standard bank CSV (DD/MM/YYYY dates, debit/credit columns, serial-based dedup)
  - IG Markets: trade history format (direction, quantity, price, commission) or CFD format
  - IBKR: prefixed row format (`Transaction History,Data,...`), maps Buy/Sell/Dividend/Adjustment to types
- **Deduplication** — hash-based `sourceReference` prevents re-importing the same transaction
- **Learned categorisation** — on import, looks up existing transactions with matching descriptions to auto-assign `taxCategory` and `entity`

### Capital Gains Tax (`/cgt`)
- **Asset list table** — description, type badge, acquisition date, cost base, disposal date, net proceeds, gain/loss, discount eligibility, net capital gain
- **Add/Edit form** with two-column layout:
  - Top section: description, asset type (property/shares/crypto/other), entity, tax year
  - Acquisition section: date, purchase price, dynamic cost base items (label + amount, add/remove)
  - Disposal section: date, sale price, dynamic disposal cost items (label + amount, add/remove)
  - Notes textarea
  - File attachments (when editing)
- **Live calculation preview** — updates as you type: total cost base, net proceeds, capital gain/loss
- **Auto-save** — 800ms debounce when editing existing assets (shows "Saving..." / "Saved" indicator)
- **50% CGT discount** — automatically applied when entity is personal, asset held >1 year, and gain is positive
- **Total net capital gain** footer row

### Income (`/income`)
- **Manual income entries** — for income not captured via bank/broker imports (salary, rental, interest, dividends, business, foreign, other)
- **Add/Edit form** — description, income type, gross amount, date, entity, tax year, payer, notes
- **File attachments** when editing
- **Auto-save** — 800ms debounce when editing existing entries
- **Table** with type badges, payer, amount, edit/delete actions
- **Total row** footer
- Entries appear on Dashboard income table alongside categorised transactions

### Exclusion Filters (`/filters`)
- **Pattern-based filtering** — hide transactions from Transactions view whose description matches a pattern
- **Source scoping** — filter can apply to a specific source or "All sources"
- **Reason grouping** — filters displayed grouped by reason (e.g. "Personal - groceries", "Ignored from transactions")
- **Active toggle** — enable/disable individual filters without deleting
- **Add form** — pattern, source, reason
- Filters applied server-side via MongoDB `$nor` with regex matching

### Settings (`/settings`)
- **Entities management** — add/remove entities (key + label). Used for entity assignment and global filtering.
- **Sources management** — add/remove data sources (key + label + type: bank/broker). Used for imports and filtering.
- Seeded defaults: Entities (Personal, AAMSCO), Sources (Westpac, IG Markets, Interactive Brokers)

### File Attachments (shared component)
- **Link-based** — references files on disk, does not copy them
- Attachable to: transactions, income entries, CGT assets
- **File browser modal**:
  - Sidebar with shortcuts: Home, Desktop, Documents, Downloads, Google Drive folders
  - Directory listing with subdirectories (double-click to navigate) and files (click to select, double-click to attach)
  - Parent directory navigation ("..") and current path display
  - File sizes displayed
  - Last visited directory persisted in `localStorage`
- **Attachment list** — shows linked files with name, size, view link (opens in new tab), and remove button

## Key Patterns

- **Auto-categorisation rules**: Trading→I12, Dividends→I10B, Trading fees→D10, Bank interest→I10A, Salary→I1, Donations→D9
- **Learned assignments**: When categorising a transaction, all transactions with the same description get the same category. Same for entity assignment (scoped by source). Applied retroactively during import.
- **Undo stack**: `useRef`-based stack for recent operations in Transactions page (Cmd+Z)
- **Auto-save**: CGT assets and income entries auto-save with 800ms debounce when editing
- **Tax year filtering**: Global `TaxYearContext` drives all data fetches across all pages
- **Pagination**: Default 50 items, max 200
- **Exclusion filters**: Applied by default server-side to transaction queries via `$nor` regex, togglable in UI

## Git Workflow

- **Do not commit directly to `main`.**
- Create feature/fix branches for changes.
- `main` is the production branch.

## MongoDB Collections

`transactions`, `cgtassets`, `entities`, `filters`, `incomes`, `sources`, `taxcategories`, `attachments`
