# SimpleBilling 🖨️🧾

A fast, responsive, web-based billing software designed specifically for Xerox, photocopying, and stationery shops. Built with Next.js 16 (App Router), TypeScript, Tailwind CSS, and Supabase PostgreSQL.

![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase)

---

## 📖 About The Project

**SimpleBilling (PrintPro ERP)** is a modern, lightweight, and robust Point-of-Sale (POS) and ERP system tailored specifically for **Xerox centres, digital printing shops, photocopy studios, and stationery stores**.

Traditional billing software is often bloated, complex, or rigid when handling dynamic printing jobs (such as custom page-count rates, variable lamination/binding services, split payment methods, and loyalty calculations). **SimpleBilling** solves this by providing:

- ⚡ **High-Speed Counter Operations**: Fast item entry with quick Xerox/print job presets and on-the-fly rate adjustments.
- 🔒 **Multi-Tenant Security**: Strict Row-Level Security (RLS) policies on Supabase PostgreSQL isolating user data cleanly (`auth.uid() = user_id`).
- 📱 **Multi-Platform Ecosystem**: Seamless real-time sync between the **Next.js Web Admin Portal** and the companion **Flutter Mobile POS App** with offline resilience and queue management.
- 🧾 **Flexible Print Formats**: Instant 1-click printing for **80mm Thermal POS Receipts** and **Standard A4 Tax Invoices**.
- 👥 **Customer Ledgers & Dues**: Real-time balance tracking, advance deposits, customer running accounts, and loyalty point rewards.

---

## 🌟 Key Features

### 1. 📊 Interactive Dashboard
- **Daily Metrics**: Today's Sales (₹), Today's Bills count, Pending Customer Dues balance, Total Customers.
- **Financial Summary**: Total Income, Total Expenses, and Net Profit overview.
- **Recent Bills List**: Quick 1-click preview and print trigger.

### 2. 📄 Dual-Mode Invoice Printer
- **Thermal POS Receipt (80mm)**: Compact receipt format tailored for POS thermal printers.
- **Standard A4 Tax Invoice**: Full-page clean invoice format for standard A4 printers.
- **Print Optimization**: Clean `@media print` rules hide UI navigation, headers, and buttons during printing.

### 3. 📑 POS Billing Workflow
- **Customer Selection**: Walk-in customer or registered account select.
- **Editable Item Rates**: Adjust page rates (e.g. 45 A4 B&W copies @ ₹1.50/page) on-the-fly during billing.
- **Calculations**: Auto-calculates Subtotal, Discount, Grand Total, and Amount Received.
- **Payment Options**: Cash, UPI, and Card.

### 4. 👥 Customer Directory & Running Ledgers
- **Customer Dues Tracking**: Calculates real-time running balance from actual bill history and payments.
- **Ledger Timeline**: Chronological view of Bills (+) and Payments (-).
- **Payment Settlements**: Record partial or full cash/UPI payments against customer balances.

### 5. 📦 Products Catalog
- **Stationery & Xerox Services**: A4 B&W, A4 Color, A3 Color, Lamination, Spiral Binding, Pens, Notebooks.
- **Full CRUD**: Add, edit, search, and delete catalog products.

### 6. 💰 Simple Accounting & Expenses
- **Expense Log**: Category tracking for Shop Expenses, Electricity Bills, Rent, and Miscellaneous expenses.
- **Net Profit Engine**: Net Profit = Total Income (Sales) - Total Expenses.

### 7. 📈 Business Reports & Export
- **Daily Sales Report**, **Monthly Summary**, and **Customer Due List**.
- **1-Click Export**: Download reports directly as **CSV** or print formatted **PDFs**.

---

## 🚀 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Database & Auth**: Supabase (PostgreSQL)

---

## 🛠️ Getting Started

### Prerequisites

- Node.js (v18.x or higher)
- npm or pnpm
- A free [Supabase](https://supabase.com) account

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/RR-Alen-06/SimpleBilling.git
cd SimpleBilling
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Initialize Database Schema

1. Open your Supabase Project Dashboard.
2. Navigate to the **SQL Editor**.
3. Copy and run the contents of [`schema.sql`](./schema.sql).

This initializes all necessary tables (`customers`, `products`, `bills`, `bill_items`, `payments`, `expenses`) and configures automated bill numbering (`BILL-000001`).

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📁 Project Structure

```text
SimpleBilling/
├── schema.sql                 # Complete Supabase PostgreSQL DDL & triggers
├── src/
│   ├── app/
│   │   ├── billing/           # POS Billing page with editable prices
│   │   ├── customers/         # Customer directory & [id] ledger page
│   │   ├── expenses/          # Simple accounting & expense tracker
│   │   ├── login/             # Single admin login page
│   │   ├── products/          # Product catalog management
│   │   ├── reports/           # Sales reports & CSV export
│   │   ├── layout.tsx         # Root app layout & global navigation
│   │   └── page.tsx           # Dashboard & business summary
│   ├── components/
│   │   ├── InvoiceModal.tsx    # Dual-mode (80mm & A4) print invoice modal
│   │   ├── Navigation.tsx      # Top bar & sidebar navigation
│   │   └── SupabaseBanner.tsx  # Database status indicator
│   └── lib/
│       ├── services/api.ts    # Supabase CRUD API service layer
│       ├── supabase/client.ts # Supabase client initialization
│       └── types.ts           # TypeScript interfaces & domain models
└── README.md
```

---

## 📜 License

This project is open-source and available under the [MIT License](LICENSE).