from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("roadmaps.urls")),
]

# In development Django serves uploaded PDFs itself. In production, let your
# web server (nginx etc.) serve MEDIA_ROOT instead.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
