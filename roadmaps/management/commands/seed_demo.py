"""python manage.py seed_demo

Adds three approved sample roadmaps so the site is not empty on first run.
Safe to run twice: a roadmap whose title already exists is skipped.
Delete them later from /admin/ when you have real content.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from roadmaps.models import Checkpoint, Resource, Roadmap

L = Resource.Kind.URL

DEMOS = [
    {
        "title": "Python from Scratch",
        "description": "From never having written code to building small, useful programs. Uses free, well-regarded material only.",
        "checkpoints": [
            ("Install Python and write your first program", "Get a working setup and run something.", [
                (L, "The official Python tutorial", "https://docs.python.org/3/tutorial/",
                 "Start with the first few chapters. Short, accurate and written by the language's maintainers."),
            ]),
            ("Learn the fundamentals", "Variables, loops, functions, lists and dictionaries.", [
                (L, "CS50's Introduction to Programming with Python", "https://cs50.harvard.edu/python/",
                 "Video lectures with problem sets. Best if you like structure and deadlines."),
                (L, "Automate the Boring Stuff with Python", "https://automatetheboringstuff.com/",
                 "A free book that teaches through practical tasks. Best if you learn by doing."),
                (L, "Python tutorial: data structures", "https://docs.python.org/3/tutorial/datastructures.html",
                 "Lists, dictionaries, sets and tuples in the official documentation. Best if you prefer to read."),
            ]),
            ("Practise with small problems", "Turn knowledge into reflex.", [
                (L, "Exercism: Python track", "https://exercism.org/tracks/python",
                 "Exercises with feedback from mentors."),
                (L, "A tour of the standard library", "https://docs.python.org/3/tutorial/stdlib.html",
                 "Learn what Python already gives you before reinventing it."),
            ]),
            ("Build something real", "A project is where it all comes together.", [
                (L, "Project-based learning (curated list)", "https://github.com/practical-tutorials/project-based-learning",
                 "Pick a tutorial for a project that interests you and build it end to end."),
            ]),
        ],
    },
    {
        "title": "Linear Algebra Essentials",
        "description": "Vectors, matrices and the ideas behind them, with intuition first and calculation second.",
        "checkpoints": [
            ("Build geometric intuition", "See what vectors and matrices do before computing anything.", [
                (L, "Essence of linear algebra (3Blue1Brown)", "https://www.3blue1brown.com/topics/linear-algebra",
                 "A short video series that makes the ideas visual."),
            ]),
            ("Vectors, matrices and systems of equations", "The core toolkit.", [
                (L, "Khan Academy: Linear algebra", "https://www.khanacademy.org/math/linear-algebra",
                 "Gentle, with practice exercises."),
                (L, "MIT 18.06 Linear Algebra", "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/",
                 "Full university lectures and problem sets. Faster and more rigorous."),
            ]),
            ("Eigenvalues and applications", "Where the subject earns its keep.", [
                (L, "Khan Academy: Alternate bases and eigen-topics", "https://www.khanacademy.org/math/linear-algebra",
                 "Work through the later units on eigenvectors and change of basis."),
            ]),
        ],
    },
    {
        "title": "How Computers Work: Logic to CPU",
        "description": "Start from a single logic gate and work up to a machine that runs programs.",
        "checkpoints": [
            ("Boolean logic and gates", "AND, OR, NOT and how they combine.", [
                (L, "Nand to Tetris", "https://www.nand2tetris.org/",
                 "Build a whole computer from one gate. The first projects cover logic gates."),
                (L, "Logic.ly", "https://logic.ly",
                 "Drag-and-drop circuits to try ideas instantly."),
            ]),
            ("Build an arithmetic circuit", "Adders and the ALU.", [
                (L, "Ben Eater: Building an 8-bit computer", "https://eater.net/8bit",
                 "Video series that builds real hardware, step by step."),
            ]),
            ("From gates to a CPU", "Registers, memory and the fetch-decode-execute cycle.", [
                (L, "Nand to Tetris (CPU and memory projects)", "https://www.nand2tetris.org/",
                 "Continue with the memory and CPU projects."),
                (L, "Crash Course Computer Science", "https://thecrashcourse.com/topic/computerscience/",
                 "A friendly overview of the whole stack."),
            ]),
        ],
    },
]


class Command(BaseCommand):
    help = "Create sample roadmaps (approved) for first-time setup."

    @transaction.atomic
    def handle(self, *args, **options):
        created = 0
        for demo in DEMOS:
            if Roadmap.objects.filter(title=demo["title"]).exists():
                continue
            roadmap = Roadmap.objects.create(
                title=demo["title"],
                description=demo["description"],
                status=Roadmap.Status.APPROVED,
                submitter_name="Roadkeep",
            )
            for ci, (title, description, resources) in enumerate(demo["checkpoints"]):
                checkpoint = Checkpoint.objects.create(
                    roadmap=roadmap, title=title, description=description, order=ci
                )
                for ri, (kind, rtitle, url, rdesc) in enumerate(resources):
                    Resource.objects.create(
                        checkpoint=checkpoint, kind=kind, title=rtitle, url=url, description=rdesc, order=ri
                    )
            created += 1
        self.stdout.write(self.style.SUCCESS(f"Created {created} sample roadmap(s)."))
