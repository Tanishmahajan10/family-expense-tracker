from datetime import date
import os
import sys
from pathlib import Path
from typing import Optional

# Ensure the backend directory is in sys.path regardless of how uvicorn is started
current_dir = Path(__file__).resolve().parent
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

from fastapi import FastAPI, Depends, HTTPException, status, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, text

import bcrypt
import random
import string
import secrets

import models
from database import engine, SessionLocal
from schema import (
    ExpenseCreate,
    ExpenseUpdate,
    ExpenseResponse,
    FamilyCreate,
    FamilyMemberCreate,
    FamilyMemberLogin
)


app = FastAPI(title="Expense Tracker API")


# ============================================================
# CORS
# ============================================================

cors_env = os.getenv("CORS_ORIGINS", "").strip()
cors_origins = [o.strip() for o in cors_env.split(",") if o.strip()] if cors_env else [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://family-expense-tracker-frontend.onrender.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


try:
    models.Base.metadata.create_all(bind=engine)
except Exception as e:
    import logging
    logging.getLogger("uvicorn.error").error(f"Failed to create database tables on startup: {e}")


# ============================================================
# DATABASE
# ============================================================

def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


# ============================================================
# AUTHENTICATION
# ============================================================

def get_current_member(
    session_token: str = Header(..., alias="session_token"),
    db: Session = Depends(get_db)
):
    session = db.query(models.LoginSession).filter(
        models.LoginSession.session_token == session_token
    ).first()

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session"
        )

    member = db.query(models.FamilyMember).filter(
        models.FamilyMember.id == session.member_id
    ).first()

    if member is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Member not found"
        )

    return member


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    return {
        "status": "ok",
        "database": db_status
    }


# ============================================================
# CURRENT MEMBER
# ============================================================

@app.get("/me")
def get_me(
    current_member: models.FamilyMember = Depends(get_current_member)
):
    return {
        "member_id": current_member.id,
        "name": current_member.name,
        "family_id": current_member.family_id
    }


# ============================================================
# GET ALL EXPENSES
# ============================================================

@app.get("/expenses")
def get_expenses(
    current_member: models.FamilyMember = Depends(get_current_member),
    db: Session = Depends(get_db)
):
    expenses = db.query(models.Expense).filter(
        models.Expense.family_id == current_member.family_id
    ).all()

    result = []

    for expense in expenses:

        expense_member = db.query(models.FamilyMember).filter(
            models.FamilyMember.id == expense.member_id
        ).first()

        result.append({
            "id": expense.id,
            "amount": expense.amount,
            "category": expense.category,
            "date": expense.date,
            "added_by": (
                expense_member.name
                if expense_member
                else "Unknown"
            )
        })

    return result


# ============================================================
# CREATE EXPENSE
# ============================================================

@app.post(
    "/expenses",
    status_code=status.HTTP_201_CREATED
)
def create_expense(
    expense: ExpenseCreate,
    current_member: models.FamilyMember = Depends(get_current_member),
    db: Session = Depends(get_db)
):
    new_expense = models.Expense(
        **expense.model_dump(),
        family_id=current_member.family_id,
        member_id=current_member.id
    )

    try:
        db.add(new_expense)
        db.commit()
        db.refresh(new_expense)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while saving expense."
        )

    return new_expense


# ============================================================
# FILTER BY CATEGORY
# ============================================================

@app.get("/expenses/filter")
def filter_expenses(
    category: str,
    current_member: models.FamilyMember = Depends(get_current_member),
    db: Session = Depends(get_db)
):
    expenses = db.query(models.Expense).filter(
        models.Expense.family_id == current_member.family_id,
        func.lower(models.Expense.category) == category.lower()
    ).all()

    result = []

    for expense in expenses:

        expense_member = db.query(models.FamilyMember).filter(
            models.FamilyMember.id == expense.member_id
        ).first()

        result.append({
            "id": expense.id,
            "amount": expense.amount,
            "category": expense.category,
            "date": expense.date,
            "added_by": (
                expense_member.name
                if expense_member
                else "Unknown"
            )
        })

    return result


# ============================================================
# FILTER BY DATE RANGE
# ============================================================

@app.get(
    "/expenses/filterbydate",
    response_model=list[ExpenseResponse]
)
def get_expense_by_date(
    start_date: date,
    end_date: date,
    current_member: models.FamilyMember = Depends(get_current_member),
    db: Session = Depends(get_db)
):
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date must be before or equal to end_date"
        )

    expenses = db.query(models.Expense).filter(
        models.Expense.family_id == current_member.family_id,
        models.Expense.date >= start_date,
        models.Expense.date <= end_date
    ).all()

    result = []

    for expense in expenses:

        expense_member = db.query(models.FamilyMember).filter(
            models.FamilyMember.id == expense.member_id
        ).first()

        result.append({
            "id": expense.id,
            "amount": expense.amount,
            "category": expense.category,
            "date": expense.date,
            "added_by": (
                expense_member.name
                if expense_member
                else "Unknown"
            )
        })

    return result


# ============================================================
# MONTHLY SUMMARY
# ============================================================

@app.get("/expenses/summary/monthly")
def monthly_expense_summary(
    year: int,
    month: int,
    current_member: models.FamilyMember = Depends(get_current_member),
    db: Session = Depends(get_db)
):
    if month < 1 or month > 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Month must be between 1 and 12"
        )

    total_expense = db.query(
        func.coalesce(
            func.sum(models.Expense.amount),
            0
        )
    ).filter(
        models.Expense.family_id == current_member.family_id,
        extract("year", models.Expense.date) == year,
        extract("month", models.Expense.date) == month
    ).scalar()

    return {
        "year": year,
        "month": month,
        "total_expense": total_expense
    }


# ============================================================
# # SUMMARY BY CATEGORY
# # ============================================================

# @app.get("/expenses/summary_by_category")
# def expense_summary_by_category(
#     category: str,
#     current_member: models.FamilyMember = Depends(get_current_member),
#     db: Session = Depends(get_db)
# ):
#     total_expense = db.query(
#         func.coalesce(
#             func.sum(models.Expense.amount),
#             0
#         )
#     ).filter(
#         models.Expense.family_id == current_member.family_id,
#         func.lower(models.Expense.category) == category.lower()
#     ).scalar()

#     return {
#         "category": category,
#         "total_expense": total_expense
#     }

# ============================================================
# # SUMMARY BY FAMILY MEMBER
# # ============================================================

@app.get("/expenses/summary_by_member")
def expense_summary_by_member(
    current_member: models.FamilyMember = Depends(get_current_member),
    db: Session = Depends(get_db)
):
    results = db.query(
        models.FamilyMember.name,
        func.coalesce(
            func.sum(models.Expense.amount),
            0
        ).label("total_expense")
    ).outerjoin(
        models.Expense,
        models.FamilyMember.id == models.Expense.member_id
    ).filter(
        models.FamilyMember.family_id == current_member.family_id
    ).group_by(
        models.FamilyMember.id,
        models.FamilyMember.name
    ).order_by(
        models.FamilyMember.name
    ).all()

    return {
        "family_id": current_member.family_id,
        "member_summary": [
            {
                "member_name": name,
                "total_expense": total
            }
            for name, total in results
        ]
    }


# ============================================================
# YEARLY SUMMARY
# ============================================================

@app.get("/expenses/summary_by_year")
def expense_summary_of_all_months(
    year: int,
    current_member: models.FamilyMember = Depends(get_current_member),
    db: Session = Depends(get_db)
):
    results = db.query(
        extract(
            "month",
            models.Expense.date
        ).label("month"),

        func.sum(
            models.Expense.amount
        ).label("total_expense")

    ).filter(
        models.Expense.family_id == current_member.family_id,
        extract("year", models.Expense.date) == year
    ).group_by(
        extract("month", models.Expense.date)
    ).order_by(
        extract("month", models.Expense.date)
    ).all()

    monthly_totals = {
        int(month): total
        for month, total in results
    }

    return {
        "year": year,
        "monthly_totals": monthly_totals
    }


# ============================================================
# GET ONE EXPENSE
# ============================================================

@app.get("/expenses/{expense_id}")
def get_expense(
    expense_id: int,
    current_member: models.FamilyMember = Depends(get_current_member),
    db: Session = Depends(get_db)
):
    expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.family_id == current_member.family_id
    ).first()

    if expense is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
        )

    expense_member = db.query(models.FamilyMember).filter(
        models.FamilyMember.id == expense.member_id
    ).first()

    return {
        "id": expense.id,
        "amount": expense.amount,
        "category": expense.category,
        "date": expense.date,
        "added_by": (
            expense_member.name
            if expense_member
            else "Unknown"
        )
    }


# ============================================================
# UPDATE EXPENSE
# ============================================================

@app.put("/expenses/{expense_id}")
def update_expense(
    expense_id: int,
    updated_data: ExpenseUpdate,
    current_member: models.FamilyMember = Depends(get_current_member),
    db: Session = Depends(get_db)
):
    expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.family_id == current_member.family_id
    ).first()

    if expense is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
        )

    update_data = updated_data.model_dump(
        exclude_unset=True
    )

    for field, value in update_data.items():
        setattr(expense, field, value)

    try:
        db.commit()
        db.refresh(expense)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while updating expense."
        )

    return {
        "message": "Expense updated successfully",
        "id": expense.id,
        "amount": expense.amount,
        "category": expense.category,
        "date": expense.date
    }


# ============================================================
# DELETE EXPENSE
# ============================================================

@app.delete("/expenses/{expense_id}")
def delete_expense(
    expense_id: int,
    current_member: models.FamilyMember = Depends(get_current_member),
    db: Session = Depends(get_db)
):
    expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.family_id == current_member.family_id
    ).first()

    if expense is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
        )

    try:
        db.delete(expense)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while deleting expense."
        )

    return {
        "message": "Expense deleted successfully",
        "id": expense_id
    }


# ============================================================
# CREATE FAMILY
# ============================================================

@app.post(
    "/families",
    status_code=status.HTTP_201_CREATED
)
def create_family(
    family: FamilyCreate,
    db: Session = Depends(get_db)
):
    existing_family = db.query(models.Family).filter(
        func.lower(models.Family.name) == family.name.strip().lower()
    ).first()

    if existing_family:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Family name already exists"
        )

    # Retry loop to guarantee a unique 6-character code
    entry_code = None
    for _ in range(15):
        candidate = ''.join(
            secrets.choice(
                string.ascii_uppercase + string.digits
            ) for _ in range(6)
        )
        if not db.query(models.Family).filter(models.Family.entry_code == candidate).first():
            entry_code = candidate
            break

    if not entry_code:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not generate unique family code. Please try again."
        )

    new_family = models.Family(
        name=family.name.strip(),
        entry_code=entry_code
    )

    try:
        db.add(new_family)
        db.commit()
        db.refresh(new_family)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while saving family."
        )

    return {
        "message": "Family created successfully",
        "family_id": new_family.id,
        "family_name": new_family.name,
        "entry_code": new_family.entry_code,
        # Backward compatibility aliases for cached PWA clients:
        "name": new_family.name,
        "code": new_family.entry_code,
        "family_code": new_family.entry_code
    }


# ============================================================
# JOIN FAMILY
# ============================================================

@app.post(
    "/families/join",
    status_code=status.HTTP_201_CREATED
)
def join_family(
    member: FamilyMemberCreate,
    db: Session = Depends(get_db)
):
    family = db.query(models.Family).filter(
        models.Family.entry_code == member.family_code
    ).first()

    if family is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid family code"
        )

    existing_member = db.query(models.FamilyMember).filter(
        models.FamilyMember.name == member.name,
        models.FamilyMember.family_id == family.id
    ).first()

    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Member already exists in this family"
        )

    hashed_pin = bcrypt.hashpw(
        member.pin.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")

    new_member = models.FamilyMember(
        name=member.name,
        pin_hash=hashed_pin,
        family_id=family.id
    )

    try:
        db.add(new_member)
        db.commit()
        db.refresh(new_member)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while joining family."
        )

    return {
        "message": "Joined family successfully",
        "member_id": new_member.id,
        "name": new_member.name,
        "family_id": family.id,
        "family_name": family.name
    }


# ============================================================
# LOGIN
# ============================================================

@app.post("/families/login")
def login_family_member(
    member: FamilyMemberLogin,
    db: Session = Depends(get_db)
):
    family = db.query(models.Family).filter(
        models.Family.entry_code == member.family_code
    ).first()

    if family is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid family code"
        )

    family_member = db.query(models.FamilyMember).filter(
        models.FamilyMember.name == member.name,
        models.FamilyMember.family_id == family.id
    ).first()

    if family_member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this family"
        )

    if not bcrypt.checkpw(
        member.pin.encode("utf-8"),
        family_member.pin_hash.encode("utf-8")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect PIN"
        )

    session_token = secrets.token_urlsafe(32)

    new_session = models.LoginSession(
        session_token=session_token,
        member_id=family_member.id
    )

    try:
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while saving login session."
        )

    return {
        "message": "Login successful",
        "session_token": session_token,
        "member_id": family_member.id,
        "name": family_member.name,
        "family_id": family.id,
        "family_name": family.name
    }


# ============================================================
# LOGOUT
# ============================================================

@app.post("/families/logout")
def logout_family_member(
    session_token: Optional[str] = Header(None, alias="session_token"),
    db: Session = Depends(get_db)
):
    if session_token:
        session = db.query(models.LoginSession).filter(
            models.LoginSession.session_token == session_token
        ).first()
        if session:
            db.delete(session)
            db.commit()

    return {"message": "Logged out successfully"}


# ============================================================
# STATIC FILES & PWA (FRONTEND)
# ============================================================

frontend_path = Path(__file__).resolve().parent.parent / "frontend"

if frontend_path.exists() and frontend_path.is_dir():
    @app.get("/", include_in_schema=False)
    def serve_index():
        index_file = frontend_path / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return {"message": "Expense Tracker API is running"}

    @app.get("/style.css", include_in_schema=False)
    def serve_style():
        css = frontend_path / "style.css"
        if css.exists():
            return FileResponse(css, media_type="text/css")
        raise HTTPException(status_code=404)

    @app.get("/app.js", include_in_schema=False)
    def serve_app():
        js = frontend_path / "app.js"
        if js.exists():
            return FileResponse(js, media_type="application/javascript")
        raise HTTPException(status_code=404)

    @app.get("/manifest.json", include_in_schema=False)
    def serve_manifest():
        m = frontend_path / "manifest.json"
        if m.exists():
            return FileResponse(m, media_type="application/manifest+json")
        raise HTTPException(status_code=404)

    @app.get("/sw.js", include_in_schema=False)
    def serve_sw():
        sw = frontend_path / "sw.js"
        if sw.exists():
            return FileResponse(
                sw,
                media_type="application/javascript",
                headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"}
            )
        raise HTTPException(status_code=404)

    @app.get("/icons/{icon_name}", include_in_schema=False)
    def serve_icon(icon_name: str):
        safe_name = Path(icon_name).name
        icon_file = frontend_path / "icons" / safe_name
        if icon_file.exists():
            return FileResponse(icon_file, media_type="image/png")
        raise HTTPException(status_code=404)