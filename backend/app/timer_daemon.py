"""Run with python -m app.timer_daemon; health is private to the container."""
import logging
import signal
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Event, Thread

from sqlalchemy.exc import OperationalError, InterfaceError
from sqlalchemy.exc import TimeoutError as PoolTimeout

from .database import engine
from .timing import advance_expired_events, initialize_legacy_timers

log = logging.getLogger(__name__)


class Progress:
    def __init__(self):
        self.updated = time.monotonic()

    def healthy(self):
        return time.monotonic() - self.updated < 60


def run_loop(stop, progress, cycle=advance_expired_events, initialize=initialize_legacy_timers):
    delay = 1
    initialized = False
    recovering = False
    while not stop.is_set():
        try:
            if not initialized:
                initialize()
                initialized = True
            cycle()
        except (OperationalError, InterfaceError, PoolTimeout) as error:
            # Authentication/configuration errors will not improve by retrying.
            code = getattr(getattr(error, 'orig', None), 'sqlstate', '') or ''
            if code.startswith(('28', '3D')):
                raise RuntimeError('Invalid daemon database configuration') from None
            log.warning('Timer database unavailable; retrying in %s seconds', delay)
            progress.updated = time.monotonic()
            recovering = True
            stop.wait(delay)
            delay = min(delay * 2, 10)
        else:
            if recovering:
                log.info('Timer database recovered')
            recovering = False
            delay = 1
            progress.updated = time.monotonic()
            stop.wait(0.2)


def main():
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    stop = Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    progress = Progress()

    class Health(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200 if self.path == '/health' and progress.healthy() else 503)
            self.end_headers()

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(('0.0.0.0', 9090), Health)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        # Import all model registrations before checking readiness.
        from . import auth, models
        from .readiness import check_schema_ready
        log.info('Timer daemon started')
        def initialize():
            check_schema_ready()
            initialize_legacy_timers()
        run_loop(stop, progress, cycle=lambda: advance_expired_events(stop.is_set), initialize=initialize)
    finally:
        server.shutdown()
        server.server_close()
        engine.dispose()
        log.info('Timer daemon stopped')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Driver exceptions may contain connection strings or bound values.
        log.error('Timer daemon failed; check configuration and database schema')
        raise SystemExit(1) from None
