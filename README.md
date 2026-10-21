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
- Store expense dates
- Display which family member added each expense

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

- **SQLite**
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
│   └── app.js
│
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

The frontend is built using plain HTML, CSS, and JavaScript.

Open the `frontend` folder and run it using a local development server.

For example, using VS Code Live Server:

1. Open the project in VS Code.
2. Open `frontend/index.html`.
3. Start Live Server.
4. Open the provided local URL in your browser.

The frontend communicates with the FastAPI backend running on:

```text
http://127.0.0.1:8000
```

---

# Database

The project currently uses **SQLite** as its database.

SQLAlchemy is used as the ORM for communicating with the database.

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

However, this project should not be considered production-grade authentication yet.

For a production application, authentication and session management should be strengthened.

# Future Improvements

Possible future improvements include:

- Better authentication and session expiration
- Password/PIN reset functionality
- Expense search
- More advanced filtering
- Expense analytics and charts
- Cloud database
- Production deployment
- Role-based family permissions

---

# Project Status

**Current Version:** V1

The project is currently focused on building a simple family expense management system with FastAPI, SQLAlchemy, SQLite, and a JavaScript frontend.

---
