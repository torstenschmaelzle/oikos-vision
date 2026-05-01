
import logging
import logging.handlers
import os

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

_FMT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATEFMT = "%Y-%m-%d %H:%M:%S"


def _fmt() -> logging.Formatter:
    return logging.Formatter(fmt=_FMT, datefmt=_DATEFMT)


def _rotating(filename: str, level: int = logging.DEBUG) -> logging.handlers.RotatingFileHandler:
    h = logging.handlers.RotatingFileHandler(
        os.path.join(LOG_DIR, filename),
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=5,
        encoding="utf-8",
    )
    h.setLevel(level)
    h.setFormatter(_fmt())
    return h


def _stream() -> logging.StreamHandler:
    h = logging.StreamHandler()
    h.setLevel(logging.DEBUG)
    h.setFormatter(_fmt())
    return h


def setup_logging() -> None:
    """Call once at startup. Sets up oikos and oikos.auth loggers."""

    # oikos → stdout + app.log + error.log (ERROR only)
    root = logging.getLogger("oikos")
    root.setLevel(logging.DEBUG)
    if not root.handlers:
        root.addHandler(_stream())
        root.addHandler(_rotating("app.log"))
        root.addHandler(_rotating("error.log", level=logging.ERROR))
    root.propagate = False  # don't double-log into uvicorn root

    # oikos.auth → inherits oikos (stdout + app.log + error.log) + auth.log
    auth = logging.getLogger("oikos.auth")
    auth.setLevel(logging.DEBUG)
    if not auth.handlers:
        auth.addHandler(_rotating("auth.log"))
    auth.propagate = True
