
import logging
from pathlib import Path


class Logger:

    @staticmethod
    def setup_loggin(log_name):

        base_dir = Path(__file__).resolve().parent
        logs_dir = base_dir / "logs"
        logs_dir.mkdir(exist_ok=True)

        logger = logger.getLogger(log_name)
        logger.setLevel(logging.INFO)
        logger.handlers.clear()

        fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        file_handler = logger.FileHandler(logs_dir/log_name.log)
        file_handler.setFormatter(fmt)

        console_handler = logging.StreamHandler()
        console_handler.setFormatter(fmt)

        logger.addHandler(file_handler)
        logger.addHandler(console_handler)


        return logger




