from django.contrib.admin.views.decorators import staff_member_required
from django.core.cache import cache
from django.core.paginator import Paginator
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django.utils.text import Truncator
from django.views.decorators.http import require_http_methods

from .models import Roadmap
from .services.submissions import (
    MAX_CHECKPOINTS,
    MAX_PDFS,
    MAX_RESOURCES_PER_CHECKPOINT,
    parse_submission,
    save_submission,
)

SUBMISSIONS_PER_HOUR = 5


def home(request):
    featured = Roadmap.objects.approved().prefetch_related("checkpoints")[:6]
    return render(
        request,
        "home.html",
        {"featured": featured, "total": Roadmap.objects.approved().count()},
    )


def roadmap_list(request):
    q = request.GET.get("q", "").strip()
    qs = Roadmap.objects.approved().search(q).prefetch_related("checkpoints").order_by("title")
    page = Paginator(qs, 12).get_page(request.GET.get("page"))
    return render(request, "roadmap_list.html", {"q": q, "page": page})


def roadmap_detail(request, slug):
    roadmap = get_object_or_404(
        Roadmap.objects.approved().prefetch_related("checkpoints__resources"), slug=slug
    )
    return render(
        request,
        "roadmap_detail.html",
        {"roadmap": roadmap, "map_data": roadmap.map_data(), "preview": False},
    )


@staff_member_required
def roadmap_preview(request, pk):
    """Lets admins look at a pending roadmap on the real map before approving it."""
    roadmap = get_object_or_404(Roadmap.objects.prefetch_related("checkpoints__resources"), pk=pk)
    return render(
        request,
        "roadmap_detail.html",
        {"roadmap": roadmap, "map_data": roadmap.map_data(), "preview": True},
    )


def api_search(request):
    """JSON used by the live search box: /api/search/?q=python"""
    q = request.GET.get("q", "").strip()
    if len(q) < 2:
        return JsonResponse({"results": []})
    found = list(Roadmap.objects.approved().search(q).prefetch_related("checkpoints")[:40])
    # Title matches first, then alphabetical.
    found.sort(key=lambda r: (q.lower() not in r.title.lower(), r.title.lower()))
    results = [
        {
            "title": r.title,
            "url": reverse("roadmap_detail", args=[r.slug]),
            "snippet": Truncator(r.description).chars(110),
            "steps": len(r.checkpoints.all()),
        }
        for r in found[:8]
    ]
    return JsonResponse({"results": results})


def _too_many_submissions(request):
    key = f"contribute:{request.META.get('REMOTE_ADDR', 'unknown')}"
    return cache.get(key, 0) >= SUBMISSIONS_PER_HOUR


def _count_submission(request):
    key = f"contribute:{request.META.get('REMOTE_ADDR', 'unknown')}"
    cache.set(key, cache.get(key, 0) + 1, 3600)


@require_http_methods(["GET", "POST"])
def contribute(request):
    if request.method == "POST":
        thanks = {"ok": True, "redirect": reverse("contribute_thanks")}

        # Honeypot: real people never see this field, bots fill it in.
        if request.POST.get("website"):
            return JsonResponse(thanks)

        if _too_many_submissions(request):
            return JsonResponse(
                {"ok": False, "errors": {"__all__": "Too many submissions from this address. Try again later."}},
                status=429,
            )

        data, errors = parse_submission(request.POST, request.FILES)
        if errors:
            return JsonResponse({"ok": False, "errors": errors}, status=400)

        save_submission(data)
        _count_submission(request)
        return JsonResponse(thanks)

    return render(
        request,
        "contribute.html",
        {
            "max_checkpoints": MAX_CHECKPOINTS,
            "max_resources": MAX_RESOURCES_PER_CHECKPOINT,
            "max_pdfs": MAX_PDFS,
        },
    )


def contribute_thanks(request):
    return render(request, "contribute_thanks.html")
