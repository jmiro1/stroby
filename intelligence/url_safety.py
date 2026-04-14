"""
URL safety validation — blocks SSRF attacks.

Prevents the intelligence service from fetching internal/private URLs
when scraping brand websites or subscribing to newsletters.
"""
from __future__ import annotations

import ipaddress
import logging
import socket
from urllib.parse import urlparse

sec_logger = logging.getLogger("security")

# Allowed schemes
ALLOWED_SCHEMES = {"http", "https"}

# Allowed ports (empty = any port for http/https)
ALLOWED_PORTS = {80, 443, None}  # None = no explicit port in URL


def validate_url(url: str) -> bool:
    """Check if a URL is safe to fetch (not internal/private).

    Returns True if safe, False if blocked.
    Logs blocked attempts to the security logger.
    """
    if not url:
        return False

    try:
        parsed = urlparse(url)
    except Exception:
        return False

    # Scheme check
    if parsed.scheme not in ALLOWED_SCHEMES:
        sec_logger.warning(f"SSRF_BLOCKED reason=bad_scheme url={url[:200]}")
        return False

    # Hostname required
    hostname = parsed.hostname
    if not hostname:
        sec_logger.warning(f"SSRF_BLOCKED reason=no_hostname url={url[:200]}")
        return False

    # Block obviously dangerous hostnames
    dangerous = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]",
                 "metadata.google.internal", "169.254.169.254"}
    if hostname.lower() in dangerous:
        sec_logger.warning(f"SSRF_BLOCKED reason=dangerous_host host={hostname}")
        return False

    # Block non-standard ports
    if parsed.port and parsed.port not in {80, 443}:
        sec_logger.warning(f"SSRF_BLOCKED reason=non_standard_port host={hostname} port={parsed.port}")
        return False

    # Resolve hostname and check IP
    try:
        resolved_ips = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror:
        sec_logger.warning(f"SSRF_BLOCKED reason=dns_failure host={hostname}")
        return False

    for family, _, _, _, addr in resolved_ips:
        ip_str = addr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue

        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            sec_logger.warning(
                f"SSRF_BLOCKED reason=private_ip host={hostname} ip={ip_str}"
            )
            return False

        # Block AWS/GCP/Azure metadata IPs
        if ip_str.startswith("169.254.") or ip_str == "fd00::":
            sec_logger.warning(f"SSRF_BLOCKED reason=metadata_ip host={hostname} ip={ip_str}")
            return False

    return True


def sanitize_url(url: str) -> str | None:
    """Validate and return a cleaned URL, or None if blocked."""
    url = url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = f"https://{url}"
    if validate_url(url):
        return url
    return None
