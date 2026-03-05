"""
URL safety checks for scraping targets.
Blocks localhost/private network destinations to reduce SSRF risk.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


_ALLOWED_SCHEMES = {"http", "https"}
_BLOCKED_HOSTS = {"localhost", "localhost.localdomain"}


def _is_blocked_ip(ip: ipaddress._BaseAddress) -> bool:
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def validate_target_url(url: str) -> None:
    """
    Raise ValueError when URL is unsafe to fetch.
    """
    parsed = urlparse(url)
    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        raise ValueError("Only http/https URLs are allowed.")

    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        raise ValueError("URL must include a valid hostname.")

    if hostname in _BLOCKED_HOSTS:
        raise ValueError("Localhost targets are not allowed.")

    # If hostname is already an IP literal, validate directly.
    ip_literal = None
    try:
        ip_literal = ipaddress.ip_address(hostname)
    except ValueError:
        ip_literal = None

    if ip_literal is not None:
        if _is_blocked_ip(ip_literal):
            raise ValueError("Private or reserved network targets are not allowed.")
        return

    try:
        resolved = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise ValueError("Target hostname could not be resolved.") from exc

    if not resolved:
        raise ValueError("Target hostname could not be resolved.")

    for addr_info in resolved:
        ip_txt = addr_info[4][0]
        ip = ipaddress.ip_address(ip_txt)
        if _is_blocked_ip(ip):
            raise ValueError("Private or reserved network targets are not allowed.")
