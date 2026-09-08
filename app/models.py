from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_max_length=30000)


class Evidence(Strict):
    block_id: str
    quote: str = Field(max_length=3000)
    page: int | None = None
    status: str = 'unmatched'
    method: str = ''
    bbox: list[float] | None = None


class Item(Strict):
    id: str = ''
    package: str = '项目整体'
    category: str = ''
    name: str
    value: str = ''
    points: str = ''
    materials: str = ''
    suggestion: str = ''
    risk_type: Literal['invalid', 'mandatory', 'review', ''] = ''
    consequence: str = ''
    evidence: list[Evidence] = Field(default_factory=list, max_length=20)
    review_status: str = '待核对'
    edited: bool = False


class Analysis(Strict):
    project_name: str = ''
    business_type: str = '待确认'
    summary: str = ''
    requirements: list[Item] = Field(default_factory=list, max_length=500)
    scores: list[Item] = Field(default_factory=list, max_length=500)
    risks: list[Item] = Field(default_factory=list, max_length=500)
    warnings: list[str] = Field(default_factory=list, max_length=500)


class Profile(Strict):
    revision: int = 0
    name: str = ''
    capabilities: str = ''
    qualifications: str = ''
    cases: str = ''
    team: str = ''
    is_demo: bool = False


class ContentBlock(Strict):
    type: Literal['paragraph', 'list', 'table'] = 'paragraph'
    text: str = ''
    items: list[str] = Field(default_factory=list, max_length=100)
    headers: list[str] = Field(default_factory=list, max_length=12)
    rows: list[list[str]] = Field(default_factory=list, max_length=100)


class Chapter(Strict):
    id: str = ''
    title: str
    requirement_ids: list[str] = Field(default_factory=list)
    score_ids: list[str] = Field(default_factory=list)
    blocks: list[ContentBlock] = Field(default_factory=list, max_length=100)
    pending: list[str] = Field(default_factory=list)
    edited: bool = False


class Outline(Strict):
    title: str
    chapters: list[Chapter] = Field(min_length=3, max_length=10)


class AnalysisEdit(Strict):
    revision: int
    analysis: Analysis


class GenerateRequest(Strict):
    consent: bool = False
    allow_incomplete: bool = False


class ChapterEdit(Strict):
    revision: int
    chapter: Chapter
