from __future__ import annotations

import time

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.deps import get_verify_service
from app.domain.models import VerifyResult
from app.services.verify_service import VerifyService, get_stored_result

router = APIRouter(prefix="/api", tags=["verify"])

_MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
_ALLOWED_TYPES = {"application/pdf", "text/plain"}


@router.post("/verify", response_model=VerifyResult, summary="Verify citations in a legal document")
def verify_document(
    file: UploadFile = File(..., description="PDF or TXT skeleton argument"),
    service: VerifyService = Depends(get_verify_service),
) -> VerifyResult:
    """
    Upload a legal document (PDF/TXT) and receive a citation integrity report.

    - **Layer 1**: Deterministic corpus lookup (FABRICATED / MISAPPLIED / VERIFIED)
    - **Layer 2**: Neo4j treatment history (OVERRULED / DISTINGUISHED / GOOD_LAW)
    - **Statutory**: legislation.gov.uk live verification for statute citations
    - **Financial**: Computed savings and risk exposure (never LLM-generated)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required.")

    ext = file.filename.lower().rsplit(".", 1)[-1]
    if ext not in {"pdf", "txt", "docx"}:
        raise HTTPException(status_code=400, detail="Only PDF, TXT and DOCX files are accepted.")

    start = time.monotonic()
    content = file.file.read()
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 20 MB.")

    result = service.run(content, file.filename)
    result.processing_ms = int((time.monotonic() - start) * 1000)
    return result


@router.get(
    "/report/{matter_id}",
    response_model=VerifyResult,
    summary="Retrieve a previously computed verification report",
)
def get_report(matter_id: str) -> VerifyResult:
    """
    Retrieve the full citation verification report for a prior /verify call.

    The `matter_id` is returned in every /verify response.
    Reports are held in memory for the lifetime of the server process (last 100).
    """
    result = get_stored_result(matter_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"No report found for matter_id '{matter_id}'. "
                   "Reports expire when the server restarts.",
        )
    return result
