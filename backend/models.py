# from database import Base
# from sqlalchemy import Column , Integer, String , Date

# class expenses(Base):
#     __tablename__ = 'ExpensesList'

#     id = Column(Integer, primary_key = True, index = True)
#     amount = Column(Integer)
#     category = Column(String)
#     date = Column(date)


from database import Base
from sqlalchemy import Column, Integer, String, Float, Date


class Family(Base):
    __tablename__ = "Families"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique = True, nullable=False)
    entry_code = Column(String(20), unique=True, nullable=False)

class Expense(Base):
    __tablename__ = "ExpensesList"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Float, nullable=False)
    category = Column(String(50), nullable=False)
    date = Column(Date, nullable=False)

    family_id = Column(Integer, nullable=False)
    member_id = Column(Integer, nullable=False)

class FamilyMember(Base):
    __tablename__ = "FamilyMembers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    pin_hash = Column(String(255), nullable=False)
    family_id = Column(Integer, nullable=False)
  

class LoginSession(Base):
    __tablename__ = "LoginSessions"

    id = Column(Integer, primary_key=True, index=True)
    session_token = Column(String(100), unique=True, nullable=False)
    member_id = Column(Integer, nullable=False)