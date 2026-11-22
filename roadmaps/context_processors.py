from django.conf import settings
from django.db import DatabaseError


def site(request):
    """Makes {{ SITE_NAME }} and {{ music_tracks }} available in every template."""
    from .models import MusicTrack

    try:
        tracks = [
            {"title": t.title, "src": t.audio.url}
            for t in MusicTrack.objects.filter(is_active=True)
            if t.audio
        ]
    except DatabaseError:
        tracks = []  # e.g. migrations not applied yet
    return {"SITE_NAME": settings.SITE_NAME, "music_tracks": tracks}
