import logging
import os
from pathlib import Path

class Logger:
    _configured = False

    @staticmethod
    def setup_logging(log_name: str = "pipeline") -> logging.Logger:
        base_dir = Path(__file__).resolve().parent
        logs_dir = Path(os.getenv("LOG_DIR", base_dir / "logs"))
        logs_dir.mkdir(parents=True, exist_ok=True)

        log_file = logs_dir / f"{log_name}.log"

        logger = logging.getLogger(log_name)

        # nur einmal konfigurieren
        if not Logger._configured:
            logger.setLevel(logging.INFO)
            logger.handlers.clear()

            fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

            file_handler = logging.FileHandler(log_file)
            file_handler.setFormatter(fmt)

            console_handler = logging.StreamHandler()
            console_handler.setFormatter(fmt)

            logger.addHandler(file_handler)
            logger.addHandler(console_handler)

            logger.propagate = False
            Logger._configured = True

        return logger

# Convenience: ein globaler default logger
log = Logger.setup_logging()