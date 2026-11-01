from .library_schemas import QuizSummary, QuizPage, Publication, VersionRead
from .library_schemas import DraftQuestion

class OrganisationQuizSummary(QuizSummary):
    revision: int | None
    has_unpublished_changes: bool | None
    capabilities: dict[str,bool]

class OrganisationQuizRead(OrganisationQuizSummary):
    questions: list[DraftQuestion] | None

class OrganisationQuizPage(QuizPage):
    items: list[OrganisationQuizSummary]

class OrganisationPublication(Publication):
    quiz: OrganisationQuizRead

class OrganisationVersionRead(VersionRead):
    capabilities: dict[str,bool]
