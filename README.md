# Family Expense Tracker

A simple full-stack web application for managing and tracking expenses within a family.

The application allows family members to create or join a family, log in using a family code and PIN, add expenses, view family expenses, edit or delete expenses, and see spending summaries by month, year, and family member.

---

## Features

### Family Management

- Create a new family
- Automatically generate a family entry code
- Join an existing family using the family code
- Multiple members can belong to the same family

### Authentication

- Login using family code, member name, and PIN
- PINs are securely hashed using `bcrypt`
- Session-based authentication using session tokens
- Session token is stored in browser `localStorage`
- Backend identifies the logged-in member from the session token

### Expense Management

- Add expenses
- View all expenses belonging to the current family
- Edit expenses
- Delete expenses
- Categorize expenses
- Filter expenses by category (All, Food, Transport, Shopping, Bills, Education, Health, Entertainment, Other)
- Store expense dates
- Display which family member added each expense

### Visual Analytics & Month Navigation

- **Spending by Category Chart**: Canvas-based interactive chart showing category-wise spending proportions and totals
- **Dynamic Month/Year Picker**: Automatically detects and lists only months containing recorded expenses for the family
- **Month Stepper (`<` / `>`)**: Jump between previous and next active months, seamlessly skipping months with no expenses
- **Interactive Legend**: Displays color-coded dots, percentages, and formatted currency amounts for each active category

### Expense Categories

The application supports:

- Food
- Groceries
- Transport
- Shopping
- Bills
- Education
- Health
- Entertainment
- Other

### Expense Summaries

- Current month spending
- Current year spending
- Yearly monthly breakdown
- Total spending by family member

### Frontend

- Responsive interface
- Mobile-friendly design
- Progressive Web App (PWA) with offline caching and service worker (`sw.js`)
- Category filter dropdown / pills for instant filtering
- Canvas donut chart with dynamic month navigation
- Login and Join Family interface
- Expense dashboard
- Add Expense form
- Edit Expense modal
- Expense summaries
- Toast notifications

---

# Tech Stack

### Backend

- **Python**
- **FastAPI**
- **SQLAlchemy**
- **Pydantic**

### Authentication & Security

- **bcrypt**
- **Session tokens**

### Frontend

- **HTML**
- **CSS**
- **JavaScript**

### Database

- **PostgreSQL (Supabase)** in production
- **SQLite** fallback for local offline development
- **SQLAlchemy ORM**

### Server

- **Uvicorn**

---

# Project Structure

```text
family-expense-tracker/
│
├── backend/
│   ├── expenses.py
│   ├── models.py
│   ├── schema.py
│   ├── database.py
│   ├── requirements.txt
│   └── expenses.db
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── sw.js
│   ├── manifest.json
│   ├── vercel.json
│   └── icons/
│
├── vercel.json
└── README.md
```

> The exact folder and file names may differ depending on your local project structure.

---

# Backend Setup

## 1. Clone the Repository

```bash
git clone https://github.com/Tanishmahajan10/family-expense-tracker.git
```

Move into the project:

```bash
cd family-expense-tracker
```

---

## 2. Go to the Backend

```bash
cd backend
```

---

## 3. Create a Virtual Environment

### macOS / Linux

```bash
python3 -m venv venv
```

Activate it:

```bash
source venv/bin/activate
```

### Windows

```bash
python -m venv venv
```

Activate it:

```bash
venv\Scripts\activate
```

---

## 4. Install Dependencies

Install the dependencies from `requirements.txt`:

```bash
pip install -r requirements.txt
```

Example `requirements.txt`:

```text
fastapi
uvicorn
sqlalchemy
pydantic
bcrypt
```

---

# Running the Backend

From the `backend` directory:

```bash
uvicorn expenses:app --reload
```

The API will run at:

```text
http://127.0.0.1:8000
```

FastAPI Swagger documentation:

```text
http://127.0.0.1:8000/docs
```

You can use the Swagger interface to test the API endpoints.

---

# Frontend

The frontend is built using plain HTML, CSS, JavaScript, and a Progressive Web App (PWA) Service Worker.

### Local Development

Run the frontend using a local development server. For example, using VS Code Live Server:

1. Open the project in VS Code.
2. Open `frontend/index.html`.
3. Start Live Server (runs on `http://127.0.0.1:5500` or `http://localhost:3000`).
4. The frontend automatically connects to the local backend on `http://127.0.0.1:8000`.

### Production Hosting (Vercel)

The frontend is configured for deployment as a static site on **Vercel**:
- Includes `vercel.json` route configurations.
- `app.js` automatically routes API traffic to the production Render backend when hosted on `*.vercel.app`.
- Can be deployed by importing the repository on Vercel with Root Directory set to `frontend` (or project root).

---

# Database

The project uses **PostgreSQL via Supabase** in production, with automatic fallback to **SQLite** (`expenses.db`) for local offline development.

SQLAlchemy is used as the ORM for communicating with the database. It connects using the `DATABASE_URL` environment variable.

The database tables are created automatically when the application starts.

The application stores information about:

- Families
- Family members
- Expenses
- Login sessions

---

# Authentication Flow

The application uses a simple session-based authentication system.

1. A family is created and receives a unique family entry code.
2. A member joins the family using the family code, name, and PIN.
3. The PIN is hashed using `bcrypt` before being stored.
4. The member logs in using the family code, name, and PIN.
5. The backend creates a random session token.
6. The frontend stores the session token in `localStorage`.
7. The token is sent with authenticated API requests.
8. The backend uses the token to identify the logged-in member.
9. The member's `family_id` is used to ensure that expense data belongs to the correct family.

---

# Security Notes

The application uses `bcrypt` to hash member PINs instead of storing the original PIN.

Session tokens are randomly generated and associated with a member in the database.

The backend uses the session token to determine the current member and family.

# Future Improvements

Possible future improvements include:

- Password/PIN reset functionality
- Export expenses (CSV / PDF)
- Custom date range reporting

---

# Project Status

**Current Architecture:**
- **Frontend:** Static PWA hosted on **Vercel** (or Render Static Site)
- **Backend:** FastAPI REST API hosted on **Render**
- **Database:** PostgreSQL on **Supabase** (production connection pooler) with automatic **SQLite** fallback for local development

---
