"""Event loop compatible with psycopg async connections on Windows."""
import asyncio
import sys


def create_event_loop():
    if sys.platform == 'win32':
        return asyncio.SelectorEventLoop()
    return asyncio.new_event_loop()
