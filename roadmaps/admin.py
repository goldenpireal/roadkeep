"""The /admin review chamber.

Community submissions arrive here with status "Pending review". An admin opens one,
checks the outline (or opens the live map preview), edits anything that needs fixing,
then approves or rejects it. Only approved roadmaps appear on the public site.
"""
from django.conf import settings
from django.contrib import admin, messages
from django.urls import reverse
from django.utils.html import format_html, format_html_join

from .models import Checkpoint, MusicTrack, Resource, Roadmap

admin.site.site_header = f"{settings.SITE_NAME} — review chamber"
admin.site.site_title = f"{settings.SITE_NAME} admin"
admin.site.index_title = "Roadmaps awaiting your judgement"


class StatusFilter(admin.SimpleListFilter):
    """Like a normal status filter, but the list opens on 'Pending review'."""

    title = "status"
    parameter_name = "status"

    def lookups(self, request, model_admin):
        return [
            (Roadmap.Status.APPROVED.value, "Approved"),
            (Roadmap.Status.REJECTED.value, "Rejected"),
            ("all", "All"),
        ]

    def queryset(self, request, queryset):
        value = self.value()
        if value is None:
            return queryset.filter(status=Roadmap.Status.PENDING)
        if value == "all":
            return queryset
        return queryset.filter(status=value)

    def choices(self, changelist):
        yield {
            "selected": self.value() is None,
            "query_string": changelist.get_query_string(remove=[self.parameter_name]),
            "display": "Pending review",
        }
        for lookup, title in self.lookup_choices:
            yield {
                "selected": self.value() == str(lookup),
                "query_string": changelist.get_query_string({self.parameter_name: lookup}),
                "display": title,
            }


class CheckpointInline(admin.TabularInline):
    model = Checkpoint
    extra = 0
    fields = ("order", "title", "description", "resource_count")
    readonly_fields = ("resource_count",)
    show_change_link = True  # click through to edit that checkpoint's resources

    @admin.display(description="Resources")
    def resource_count(self, obj):
        return obj.resources.count() if obj.pk else "-"


class ResourceInline(admin.StackedInline):
    model = Resource
    extra = 0
    fields = ("order", "kind", "title", "url", "pdf", "description")


@admin.register(Roadmap)
class RoadmapAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "submitter_name", "step_count", "created_at")
    list_filter = (StatusFilter,)
    search_fields = ("title", "description", "submitter_name", "submitter_email")
    readonly_fields = ("preview_link", "outline", "created_at", "updated_at")
    inlines = [CheckpointInline]
    actions = ["approve", "reject"]
    fieldsets = (
        ("Review", {"fields": ("status", "admin_notes", "preview_link", "outline")}),
        ("Roadmap", {"fields": ("title", "slug", "description")}),
        ("Submitted by", {"fields": ("submitter_name", "submitter_email")}),
        ("Dates", {"fields": ("created_at", "updated_at")}),
    )

    @admin.display(description="Checkpoints")
    def step_count(self, obj):
        return obj.checkpoints.count()

    @admin.display(description="Map preview")
    def preview_link(self, obj):
        if not obj.pk:
            return "Save first to preview."
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">Open in the map viewer</a>',
            reverse("roadmap_preview", args=[obj.pk]),
        )

    @admin.display(description="Outline")
    def outline(self, obj):
        if not obj.pk:
            return "-"
        blocks = []
        for number, checkpoint in enumerate(obj.checkpoints.all(), start=1):
            items = format_html_join(
                "",
                '<li>[{}] <a href="{}" target="_blank" rel="noopener noreferrer">{}</a>{}</li>',
                (
                    (r.get_kind_display(), r.href, r.title, f" — {r.description}" if r.description else "")
                    for r in checkpoint.resources.all()
                ),
            )
            blocks.append(
                format_html("<p><strong>{}. {}</strong></p><ul>{}</ul>", number, checkpoint.title, items)
            )
        if not blocks:
            return "No checkpoints yet."
        return format_html_join("", "{}", ((b,) for b in blocks))

    @admin.action(description="Approve selected roadmaps (make public)")
    def approve(self, request, queryset):
        count = queryset.update(status=Roadmap.Status.APPROVED)
        self.message_user(request, f"{count} roadmap(s) approved.", messages.SUCCESS)

    @admin.action(description="Reject selected roadmaps")
    def reject(self, request, queryset):
        count = queryset.update(status=Roadmap.Status.REJECTED)
        self.message_user(request, f"{count} roadmap(s) rejected.", messages.WARNING)


@admin.register(Checkpoint)
class CheckpointAdmin(admin.ModelAdmin):
    list_display = ("title", "roadmap", "order")
    search_fields = ("title", "roadmap__title")
    inlines = [ResourceInline]


@admin.register(MusicTrack)
class MusicTrackAdmin(admin.ModelAdmin):
    """Upload MP3 files here. Active tracks play, in order, behind the public site."""

    list_display = ("title", "is_active", "order", "player", "created_at")
    list_editable = ("is_active", "order")
    readonly_fields = ("player",)
    fields = ("title", "audio", "is_active", "order", "player")

    @admin.display(description="Listen")
    def player(self, obj):
        if not obj.pk or not obj.audio:
            return "-"
        return format_html('<audio controls preload="none" src="{}"></audio>', obj.audio.url)
