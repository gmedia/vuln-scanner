import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BlogPostCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=80)
    title: str = Field(..., min_length=1, max_length=255)
    excerpt: str = Field(..., min_length=1, max_length=2000)
    body_md: str = Field(..., min_length=1)
    locale: str = Field(default="id")


class BlogPostUpdate(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=80)
    title: str | None = Field(default=None, min_length=1, max_length=255)
    excerpt: str | None = Field(default=None, min_length=1, max_length=2000)
    body_md: str | None = Field(default=None, min_length=1)
    locale: str | None = None


class BlogUnpublishRequest(BaseModel):
    status: str = Field(default="draft")


class BlogPostAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    title: str
    excerpt: str
    body_md: str
    body_html: str
    locale: str
    status: str
    published_at: datetime | None
    author_user_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class BlogPostAdminList(BaseModel):
    items: list[BlogPostAdminOut]
    total: int


class BlogPostPublicListItem(BaseModel):
    slug: str
    title: str
    excerpt: str
    locale: str
    published_at: datetime


class BlogPostPublicList(BaseModel):
    items: list[BlogPostPublicListItem]
    total: int


class BlogPostPublicDetail(BaseModel):
    slug: str
    title: str
    excerpt: str
    body_html: str
    locale: str
    published_at: datetime
