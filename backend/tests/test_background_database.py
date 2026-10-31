"""Blocking database work must never stall the ASGI event loop."""
import asyncio
import threading
import time
from unittest.mock import patch

from app.main import timer_worker


def test_timer_lock_wait_keeps_event_loop_responsive():
    entered = threading.Event()
    release = threading.Event()

    def blocked_database_cycle():
        entered.set()
        release.wait(timeout=2)

    async def scenario():
        worker = asyncio.create_task(timer_worker())
        started = time.monotonic()
        try:
            # Request cleanup needs this same loop while a database lock waits.
            await asyncio.sleep(0.05)
            assert entered.is_set()
            assert time.monotonic() - started < 1
        finally:
            release.set()
            worker.cancel()
            try:
                await worker
            except asyncio.CancelledError:
                pass

    with patch('app.main.advance_expired_events', blocked_database_cycle):
        asyncio.run(scenario())
