from datetime import datetime
import uuid
from typing import Literal
from pydantic import BaseModel, Field, EmailStr, field_validator, ConfigDict

Role = Literal['owner','admin','instructor','learner']
AssignableRole = Literal['admin','instructor','learner']

class OrganisationName(BaseModel):
    name: str = Field(min_length=1, max_length=100, examples=['Learning team'])
    @field_validator('name')
    @classmethod
    def clean_name(cls, value):
        if not value.strip(): raise ValueError('Organisation name cannot be blank')
        return value.strip()

class OrganisationRead(BaseModel):
    id: str
    name: str
    role: Role
    capabilities: dict[str,bool]

class MembershipRead(BaseModel):
    id: str
    user_id: str
    display_name: str
    email: str
    role: Role
    active: bool

class RoleChange(BaseModel):
    role: AssignableRole = Field(description='Only owners may assign admin. Ownership requires the transfer endpoint.', examples=['learner'])
    model_config = ConfigDict(extra='forbid')

class InvitationCreate(RoleChange):
    email: EmailStr = Field(examples=['learner@example.com'])

class InvitationRead(BaseModel):
    id: str
    email: str
    role: AssignableRole
    status: str
    expires_at: datetime
    issuer_id: str

class InvitationLink(BaseModel):
    invitation: InvitationRead
    url: str

class InvitationToken(BaseModel):
    token: str = Field(min_length=20, max_length=200, description='Secret captured from the invitation URL fragment. Never put this token in a query string.')

class InvitationPreview(BaseModel):
    organisation: OrganisationRead
    role: AssignableRole
    expires_at: datetime
    accepted: bool

class TransferOwnership(BaseModel):
    user_id: uuid.UUID = Field(description='Existing active member who becomes owner; the previous owner becomes admin.')

class OrganisationAuditRead(BaseModel):
    id: str
    actor_id: str
    action: str
    target_id: str
    outcome: str
    correlation_id: str
    created_at: datetime

class AuditPage(BaseModel):
    items: list[OrganisationAuditRead]
    total: int
    offset: int
    limit: int
