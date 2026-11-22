"""Turns a community submission (form fields + uploaded files) into database rows.

Two steps, kept separate so each is easy to read and test:

    parse_submission(post, files) -> (data, errors)    pure validation, no database
    save_submission(data)         -> Roadmap           writes everything in one transaction

The browser form (static/js/contribute.js) names its fields like this:

    title, description, submitter_name, submitter_email
    cp-0-title, cp-0-description
    cp-0-r-0-kind        "url" or "pdf"
    cp-0-r-0-title, cp-0-r-0-description
    cp-0-r-0-url         (when kind is url)
    cp-0-r-0-pdf         (file, when kind is pdf)
"""
import re

from django.core.exceptions import ValidationError
from django.core.validators import URLValidator, validate_email

MAX_CHECKPOINTS = 30
MAX_RESOURCES_PER_CHECKPOINT = 8
MAX_PDFS = 10
MAX_PDF_BYTES = 10 * 1024 * 1024

_url_validator = URLValidator(schemes=["http", "https"])
_CP_RE = re.compile(r"^cp-(\d+)-title$")


def _pdf_problem(upload):
    """Returns a message if the uploaded file is not an acceptable PDF, else None."""
    if not upload.name.lower().endswith(".pdf"):
        return "Only .pdf files are allowed."
    if upload.size > MAX_PDF_BYTES:
        return "PDF files must be 10 MB or smaller."
    head = upload.read(5)
    upload.seek(0)
    if head != b"%PDF-":
        return "This file does not look like a real PDF."
    return None


def parse_submission(post, files):
    errors = {}

    def text(key, label, max_len, required=False):
        value = (post.get(key) or "").strip()
        if required and not value:
            errors[key] = f"{label} is required."
        elif len(value) > max_len:
            errors[key] = f"{label} must be at most {max_len} characters."
        return value

    data = {
        "title": text("title", "Title", 200, required=True),
        "description": text("description", "Description", 2000, required=True),
        "submitter_name": text("submitter_name", "Name", 100),
        "submitter_email": text("submitter_email", "Email", 254),
        "checkpoints": [],
    }
    if data["submitter_email"] and "submitter_email" not in errors:
        try:
            validate_email(data["submitter_email"])
        except ValidationError:
            errors["submitter_email"] = "Enter a valid email address."

    cp_indices = sorted({int(m.group(1)) for m in map(_CP_RE.match, post.keys()) if m})
    if not cp_indices:
        errors["__all__"] = "Add at least one checkpoint."
    elif len(cp_indices) > MAX_CHECKPOINTS:
        errors["__all__"] = f"A roadmap can have at most {MAX_CHECKPOINTS} checkpoints."

    pdf_count = 0
    for ci in cp_indices[:MAX_CHECKPOINTS]:
        prefix = f"cp-{ci}"
        checkpoint = {
            "title": text(f"{prefix}-title", "Checkpoint title", 150, required=True),
            "description": text(f"{prefix}-description", "Checkpoint description", 1000),
            "resources": [],
        }

        r_re = re.compile(rf"^cp-{ci}-r-(\d+)-kind$")
        r_indices = sorted({int(m.group(1)) for m in map(r_re.match, post.keys()) if m})
        if not r_indices:
            errors[prefix] = "Every checkpoint needs at least one resource."
        elif len(r_indices) > MAX_RESOURCES_PER_CHECKPOINT:
            errors[prefix] = f"At most {MAX_RESOURCES_PER_CHECKPOINT} resources per checkpoint."

        for ri in r_indices[:MAX_RESOURCES_PER_CHECKPOINT]:
            rp = f"{prefix}-r-{ri}"
            kind = post.get(f"{rp}-kind")
            if kind not in ("url", "pdf"):
                errors[f"{rp}-kind"] = "Choose Link or PDF."
                continue

            resource = {
                "kind": kind,
                "title": text(f"{rp}-title", "Resource title", 150, required=True),
                "description": text(f"{rp}-description", "Description", 1000),
                "url": "",
                "pdf": None,
            }

            if kind == "url":
                url = text(f"{rp}-url", "URL", 500, required=True)
                if url and f"{rp}-url" not in errors:
                    try:
                        _url_validator(url)
                    except ValidationError:
                        errors[f"{rp}-url"] = "Enter a valid link starting with http:// or https://"
                resource["url"] = url
            else:
                upload = files.get(f"{rp}-pdf")
                if not upload:
                    errors[f"{rp}-pdf"] = "Attach a PDF file."
                else:
                    problem = _pdf_problem(upload)
                    if problem:
                        errors[f"{rp}-pdf"] = problem
                    pdf_count += 1
                    resource["pdf"] = upload

            checkpoint["resources"].append(resource)
        data["checkpoints"].append(checkpoint)

    if pdf_count > MAX_PDFS:
        errors["__all__"] = f"At most {MAX_PDFS} PDFs per roadmap."

    return data, errors


def save_submission(data):
    # Imported here so that parse_submission can be used/tested without Django models.
    from django.db import transaction

    from roadmaps.models import Checkpoint, Resource, Roadmap

    with transaction.atomic():
        roadmap = Roadmap.objects.create(
            title=data["title"],
            description=data["description"],
            submitter_name=data["submitter_name"],
            submitter_email=data["submitter_email"],
            status=Roadmap.Status.PENDING,  # never public until an admin approves it
        )
        for ci, cp in enumerate(data["checkpoints"]):
            checkpoint = Checkpoint.objects.create(
                roadmap=roadmap, title=cp["title"], description=cp["description"], order=ci
            )
            for ri, res in enumerate(cp["resources"]):
                fields = dict(
                    checkpoint=checkpoint,
                    kind=res["kind"],
                    title=res["title"],
                    description=res["description"],
                    order=ri,
                )
                if res["kind"] == "url":
                    fields["url"] = res["url"]
                else:
                    fields["pdf"] = res["pdf"]
                Resource.objects.create(**fields)
    return roadmap
