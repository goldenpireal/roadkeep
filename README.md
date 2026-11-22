# Roadkeep — free study roadmaps

A Django site where anyone can search for a learning roadmap, explore it on a pannable
bird's-eye map, and contribute new roadmaps that an admin reviews before they go public.

Colours: `#EDE7C7` parchment, `#8B0000` crimson, `#5B0202` blood, `#200E01` night.
The site name is one setting (`SITE_NAME` in `roadmapsite/settings.py`).

## Run it

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python manage.py makemigrations roadmaps   # creates the database tables' blueprint
python manage.py migrate                   # builds the tables
python manage.py createsuperuser           # your admin login
python manage.py seed_demo                 # optional: 3 sample roadmaps
python manage.py runserver
```

Open http://127.0.0.1:8000/ and the admin at http://127.0.0.1:8000/admin/.

## Pages

| URL | What it is |
|---|---|
| `/` | Home: search box in the middle, latest roadmaps, how it works, contribute call to action |
| `/roadmaps/?q=...` | Browse and search results (paginated) |
| `/roadmaps/<slug>/` | The map viewer for one roadmap |
| `/contribute/` | Community submission form |
| `/api/search/?q=...` | JSON used by the live suggestions |
| `/preview/<id>/` | Staff-only: view any roadmap (including pending) on the real map |
| `/admin/` | Review chamber |

## Background music

In `/admin/` open **Background music tracks** and add an `.mp3` (up to 20 MB). Tick or
untick *Is active* and set *Order* straight from the list. Active tracks play one after
another, quietly, on every page. Visitors get a **Music** button in the header. It starts
off (browsers block automatic sound), and once turned on it remembers the choice and the
place in the track across pages. If no track is active, the button is hidden.
Only upload music you have the right to use.

## How a roadmap is shaped

```
Roadmap (title, description, status)
  └─ Checkpoint (title, description, order)
       └─ Resource (Link or PDF, title, description)
```

* One resource at a checkpoint: a straight line.
* Two or more resources at a checkpoint: the road forks into parallel branches and
  rejoins at the next checkpoint.

The drawing rule lives in one small, testable file: `static/js/layout.js`.

## The review flow

1. A visitor fills in `/contribute/`. The submission is saved as **Pending review**
   and is not visible on the public site.
2. In `/admin/` the Roadmaps list opens on *Pending review*. Open one to see its
   outline, click **Open in the map viewer** for a live preview, and fix anything
   (click a checkpoint's change link to edit its resources).
3. Set the status to *Approved* (or use the list actions *Approve* / *Reject*).
   Approved roadmaps appear immediately. `admin_notes` is a private place for the reason
   behind a rejection.

## Controls on the map

Drag to move, scroll or pinch to zoom, click a box for its details, use the minimap
(bottom left) to jump, `Whole map` to see everything, `Start` to return to the gate.
Keyboard: arrows pan, `+`/`-` zoom, `0` fits the whole map, `Esc` closes the details.

## Safety built in

* Submissions are never public until approved.
* Links must be `http://` or `https://`; PDFs must be real PDFs, at most 10 MB, at most 10 per roadmap.
* Uploaded PDFs get random file names.
* A hidden honeypot field and a limit of 5 submissions per hour per address.
* Everything contributors type is shown as plain text, never as HTML.

## Before going live

* Set `DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY` and `DJANGO_ALLOWED_HOSTS`.
* Run `python manage.py collectstatic` and serve `/static/` and `/media/` from your web server.
* Switch `DATABASES` to PostgreSQL when the content grows.
* The submission limit uses the server's memory cache and the client address Django sees.
  Behind a proxy or several workers, use a shared cache (for example Redis) and pass the real client address.
* Fonts (Cinzel, Cormorant Garamond) load from Google Fonts. Self-host them if you want no third-party requests.

## Layout of the code

```
roadmapsite/        settings and root URLs
roadmaps/models.py  Roadmap, Checkpoint, Resource
roadmaps/admin.py   review queue, approve/reject, outline, preview link
roadmaps/views.py   pages, search API, submission endpoint
roadmaps/services/submissions.py   validates a submission and saves it
templates/          base, home, list, detail (map), contribute
static/css/site.css the whole theme
static/js/          layout.js (where boxes go), map.js (pan/zoom/minimap),
                    search.js (suggestions), contribute.js (the builder form)
```
