# from pydantic import BaseModel, Field
# from datetime import date

# class expenseRequest(BaseModel):
#     amount: float = Field(gt=0)
#     category: str = Field(min_length=2, max_length=50)
#     date: date

#     model_config = {
#         "json_schema_extra" : {
#             "example": {
#                 "amount": 1.0,
#                 "category": "string",
#                 "date": "2026-10-03"
#                 }
#         }
#     }

from typing import Optional
from datetime import date as dt_date
from pydantic import BaseModel, Field, ConfigDict


class ExpenseCreate(BaseModel):
    amount: float = Field(gt=0)
    category: str = Field(min_length=2, max_length=50)
    date: dt_date


class ExpenseUpdate(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0)
    category: Optional[str] = Field(default=None, min_length=2, max_length=50)
    date: Optional[dt_date] = None


class ExpenseResponse(BaseModel):
    id: int
    amount: float
    category: str
    date: dt_date
    added_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class FamilyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)

class FamilyMemberCreate(BaseModel):
    family_code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=2, max_length=100)
    pin: str = Field(min_length=4, max_length=6)

class FamilyMemberLogin(BaseModel):
    family_code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=2, max_length=100)
    pin: str = Field(min_length=4, max_length=6)