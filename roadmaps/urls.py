from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("roadmaps/", views.roadmap_list, name="roadmap_list"),
    path("roadmaps/<slug:slug>/", views.roadmap_detail, name="roadmap_detail"),
    path("preview/<int:pk>/", views.roadmap_preview, name="roadmap_preview"),
    path("contribute/", views.contribute, name="contribute"),
    path("contribute/thanks/", views.contribute_thanks, name="contribute_thanks"),
    path("api/search/", views.api_search, name="api_search"),
]
