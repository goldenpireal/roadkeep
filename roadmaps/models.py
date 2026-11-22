"""Data model.

    Roadmap  --has many-->  Checkpoint  --has many-->  Resource

* A Roadmap is the whole thing: title, description, review status.
* A Checkpoint is a milestone on the path, in order.
* A Resource is a link (URL) or an uploaded PDF that helps you reach the checkpoint.

The branching rule lives in how this data is *drawn*, not in the data itself:
a checkpoint with ONE resource is a straight line; a checkpoint with TWO OR MORE
resources forks into parallel branches that rejoin at the next checkpoint.
"""
import uuid

from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.db import models
from django.db.models import Q
from django.utils.text import slugify

MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB
url_validator = URLValidator(schemes=["http", "https"])  # no javascript:, ftp:, ...


def validate_pdf(file):
    if not file.name.lower().endswith(".pdf"):
        raise ValidationError("Only .pdf files are allowed.")
    if file.size > MAX_PDF_BYTES:
        raise ValidationError("PDF files must be 10 MB or smaller.")


def pdf_upload_path(instance, filename):
    # Random file names: no collisions, and pending uploads can't be guessed.
    return f"pdfs/{uuid.uuid4().hex}.pdf"


MAX_AUDIO_BYTES = 20 * 1024 * 1024  # 20 MB


def validate_mp3(file):
    if not file.name.lower().endswith(".mp3"):
        raise ValidationError("Only .mp3 files are allowed.")
    if file.size > MAX_AUDIO_BYTES:
        raise ValidationError("MP3 files must be 20 MB or smaller.")
    try:
        head = file.read(3)
        file.seek(0)
    except (OSError, ValueError, AttributeError):
        return  # an already-stored file we cannot reopen; the checks above are enough
    # An MP3 starts with an "ID3" tag or with an MPEG frame sync (0xFF 0xE*).
    is_mp3 = head == b"ID3" or (len(head) >= 2 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0)
    if not is_mp3:
        raise ValidationError("This does not look like a real MP3 file.")


def audio_upload_path(instance, filename):
    return f"music/{uuid.uuid4().hex}.mp3"


class MusicTrack(models.Model):
    """A background-music track. Upload these in /admin/ under 'Background music tracks'."""

    title = models.CharField(max_length=150)
    audio = models.FileField(
        upload_to=audio_upload_path, validators=[validate_mp3], help_text="An .mp3 file, up to 20 MB."
    )
    is_active = models.BooleanField(default=True, help_text="Untick to stop playing this track without deleting it.")
    order = models.PositiveIntegerField(default=0, help_text="Tracks play in this order, lowest first.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "background music track"

    def __str__(self):
        return self.title


class RoadmapQuerySet(models.QuerySet):
    def approved(self):
        return self.filter(status=Roadmap.Status.APPROVED)

    def search(self, text):
        """Every word must appear in the title, description, a checkpoint or a resource."""
        qs = self
        for word in (text or "").split():
            qs = qs.filter(
                Q(title__icontains=word)
                | Q(description__icontains=word)
                | Q(checkpoints__title__icontains=word)
                | Q(checkpoints__resources__title__icontains=word)
            ).distinct()
        return qs


class Roadmap(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved (public)"
        REJECTED = "rejected", "Rejected"

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=80, unique=True, blank=True)
    description = models.TextField(max_length=2000)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    admin_notes = models.TextField(blank=True, help_text="Private. Why was it rejected / what to fix?")

    submitter_name = models.CharField(max_length=100, blank=True)
    submitter_email = models.EmailField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = RoadmapQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)[:60] or "roadmap"
            slug, n = base, 2
            while Roadmap.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base}-{n}"
                n += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def map_data(self):
        """Plain dict handed to the JavaScript map viewer."""
        return {
            "title": self.title,
            "description": self.description,
            "checkpoints": [
                {
                    "title": c.title,
                    "description": c.description,
                    "resources": [
                        {
                            "kind": r.kind,
                            "title": r.title,
                            "description": r.description,
                            "href": r.href,
                        }
                        for r in c.resources.all()
                    ],
                }
                for c in self.checkpoints.all()
            ],
        }


class Checkpoint(models.Model):
    roadmap = models.ForeignKey(Roadmap, related_name="checkpoints", on_delete=models.CASCADE)
    title = models.CharField(max_length=150)
    description = models.TextField(max_length=1000, blank=True)
    order = models.PositiveIntegerField(default=0, help_text="Position on the path (0 comes first).")

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.roadmap.title}: {self.title}"


class Resource(models.Model):
    class Kind(models.TextChoices):
        URL = "url", "Link"
        PDF = "pdf", "PDF"

    checkpoint = models.ForeignKey(Checkpoint, related_name="resources", on_delete=models.CASCADE)
    kind = models.CharField(max_length=3, choices=Kind.choices, default=Kind.URL)
    title = models.CharField(max_length=150)
    description = models.TextField(max_length=1000, blank=True)
    url = models.CharField(max_length=500, blank=True, validators=[url_validator])
    pdf = models.FileField(upload_to=pdf_upload_path, blank=True, validators=[validate_pdf])
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title

    def clean(self):
        if self.kind == self.Kind.URL and not self.url:
            raise ValidationError({"url": "A link resource needs a URL."})
        if self.kind == self.Kind.PDF and not self.pdf:
            raise ValidationError({"pdf": "A PDF resource needs a file."})

    @property
    def href(self):
        if self.kind == self.Kind.PDF:
            return self.pdf.url if self.pdf else ""
        return self.url
