"""Decode Android binary XML (AXML) to plain-text XML for manifest regex parsing."""

from __future__ import annotations

import struct
from xml.sax.saxutils import escape

CHUNK_AXML_FILE = 0x00080003
CHUNK_STRING_POOL = 0x001C0001
CHUNK_STRING_POOL_ALT = 0x0001
CHUNK_START_NAMESPACE = 0x00100100
CHUNK_END_NAMESPACE = 0x00100101
CHUNK_START_ELEMENT = 0x00100102
CHUNK_END_ELEMENT = 0x00100103

UTF8_FLAG = 1 << 8

TYPE_NULL = 0x00
TYPE_REFERENCE = 0x01
TYPE_STRING = 0x03
TYPE_INT_DEC = 0x10
TYPE_INT_HEX = 0x11
TYPE_INT_BOOLEAN = 0x12


def is_binary_axml(data: bytes) -> bool:
    if len(data) < 8:
        return False
    magic: int = struct.unpack_from("<I", data, 0)[0]
    return magic == CHUNK_AXML_FILE


def axml_to_xml(data: bytes) -> str:
    if not is_binary_axml(data):
        raise ValueError("Not a binary AXML document")

    file_size = struct.unpack_from("<I", data, 4)[0]
    if file_size > len(data):
        file_size = len(data)

    offset = 8
    strings: list[str] = []
    parts: list[str] = ['<?xml version="1.0" encoding="utf-8"?>']
    depth = 0
    ns_prefix: dict[int, str] = {}

    while offset + 8 <= file_size and offset + 8 <= len(data):
        chunk_type = struct.unpack_from("<H", data, offset)[0]
        header_size = struct.unpack_from("<H", data, offset + 2)[0]
        chunk_size = struct.unpack_from("<I", data, offset + 4)[0]

        if chunk_size < 8 or offset + chunk_size > len(data):
            break

        full_type = struct.unpack_from("<I", data, offset)[0]

        if full_type in (CHUNK_STRING_POOL, CHUNK_STRING_POOL_ALT) or chunk_type == CHUNK_STRING_POOL_ALT:
            strings = _parse_string_pool(data, offset)
        elif full_type == CHUNK_START_NAMESPACE or chunk_type == (CHUNK_START_NAMESPACE & 0xFFFF):
            if header_size >= 0x10 and chunk_size >= 0x18:
                prefix_idx = struct.unpack_from("<i", data, offset + 16)[0]
                uri_idx = struct.unpack_from("<i", data, offset + 20)[0]
                prefix = _str(strings, prefix_idx)
                if uri_idx >= 0:
                    ns_prefix[uri_idx] = prefix
        elif full_type == CHUNK_END_NAMESPACE or chunk_type == (CHUNK_END_NAMESPACE & 0xFFFF):
            if header_size >= 0x10 and chunk_size >= 0x18:
                uri_idx = struct.unpack_from("<i", data, offset + 20)[0]
                ns_prefix.pop(uri_idx, None)
        elif full_type == CHUNK_START_ELEMENT or chunk_type == (CHUNK_START_ELEMENT & 0xFFFF):
            tag, attrs = _parse_start_element(data, offset, header_size, strings, ns_prefix)
            indent = "  " * depth
            if attrs:
                attr_str = " ".join(f'{k}="{escape(v, entities={chr(34): "&quot;"})}"' for k, v in attrs)
                parts.append(f"{indent}<{tag} {attr_str}>")
            else:
                parts.append(f"{indent}<{tag}>")
            depth += 1
        elif full_type == CHUNK_END_ELEMENT or chunk_type == (CHUNK_END_ELEMENT & 0xFFFF):
            depth = max(0, depth - 1)
            name_idx = struct.unpack_from("<i", data, offset + 20)[0] if chunk_size >= 24 else -1
            tag = _str(strings, name_idx) or "unknown"
            indent = "  " * depth
            parts.append(f"{indent}</{tag}>")

        offset += chunk_size

    return "\n".join(parts)


def _str(strings: list[str], idx: int) -> str:
    if idx < 0 or idx >= len(strings):
        return ""
    return strings[idx]


def _parse_string_pool(data: bytes, offset: int) -> list[str]:
    header_size = struct.unpack_from("<H", data, offset + 2)[0]
    chunk_size = struct.unpack_from("<I", data, offset + 4)[0]
    string_count = struct.unpack_from("<I", data, offset + 8)[0]
    flags = struct.unpack_from("<I", data, offset + 16)[0]
    strings_start = struct.unpack_from("<I", data, offset + 20)[0]
    is_utf8 = bool(flags & UTF8_FLAG)

    if string_count > 1_000_000 or chunk_size > len(data):
        return []

    offsets_base = offset + header_size
    str_offsets: list[int] = []
    for i in range(string_count):
        pos = offsets_base + i * 4
        if pos + 4 > len(data):
            break
        str_offsets.append(struct.unpack_from("<I", data, pos)[0])

    abs_str_start = offset + strings_start
    end = offset + chunk_size
    out: list[str] = []
    for so in str_offsets:
        pos = abs_str_start + so
        if pos >= end or pos >= len(data):
            out.append("")
            continue
        try:
            if is_utf8:
                out.append(_decode_utf8_string(data, pos, end))
            else:
                out.append(_decode_utf16_string(data, pos, end))
        except (struct.error, IndexError, UnicodeDecodeError):
            out.append("")
    return out


def _decode_utf8_string(data: bytes, pos: int, end: int) -> str:
    # AXML UTF-8 string layout: [char_len 1-2B][byte_len 1-2B][utf8 bytes]
    if pos >= end:
        return ""
    b = data[pos]
    if b & 0x80:
        pos += 2
    else:
        pos += 1
    if pos >= end:
        return ""
    b = data[pos]
    if b & 0x80:
        if pos + 1 >= end:
            return ""
        byte_len = ((b & 0x7F) << 8) | data[pos + 1]
        pos += 2
    else:
        byte_len = b
        pos += 1
    if pos + byte_len > end or pos + byte_len > len(data):
        byte_len = max(0, min(byte_len, end - pos, len(data) - pos))
    return data[pos : pos + byte_len].decode("utf-8", errors="replace")


def _decode_utf16_string(data: bytes, pos: int, end: int) -> str:
    if pos + 2 > end:
        return ""
    char_len = struct.unpack_from("<H", data, pos)[0] & 0x7FFF
    pos += 2
    byte_len = char_len * 2
    if pos + byte_len > end or pos + byte_len > len(data):
        byte_len = max(0, min(byte_len, end - pos, len(data) - pos))
        byte_len -= byte_len % 2
    return data[pos : pos + byte_len].decode("utf-16-le", errors="replace")


def _parse_start_element(
    data: bytes,
    offset: int,
    header_size: int,
    strings: list[str],
    ns_prefix: dict[int, str],
) -> tuple[str, list[tuple[str, str]]]:
    if header_size < 0x10:
        return "unknown", []

    name_idx = struct.unpack_from("<i", data, offset + 20)[0]
    attr_start = struct.unpack_from("<H", data, offset + 24)[0]
    attr_size = struct.unpack_from("<H", data, offset + 26)[0]
    attr_count = struct.unpack_from("<H", data, offset + 28)[0]

    tag = _str(strings, name_idx) or "unknown"
    if attr_size == 0:
        attr_size = 20

    attrs: list[tuple[str, str]] = []
    attr_base = offset + 16 + attr_start
    for i in range(attr_count):
        a_off = attr_base + i * attr_size
        if a_off + 20 > len(data):
            break
        a_ns = struct.unpack_from("<i", data, a_off)[0]
        a_name = struct.unpack_from("<i", data, a_off + 4)[0]
        a_raw = struct.unpack_from("<i", data, a_off + 8)[0]
        data_type = data[a_off + 15]
        data_val = struct.unpack_from("<I", data, a_off + 16)[0]

        name = _str(strings, a_name)
        if not name:
            continue
        prefix = ""
        if a_ns >= 0:
            p = ns_prefix.get(a_ns) or ""
            uri = _str(strings, a_ns) if a_ns < len(strings) else ""
            if "android.com/apk/res/android" in uri or p == "android":
                prefix = "android:"
            elif p:
                prefix = f"{p}:"
        value = _format_attr_value(strings, a_raw, data_type, data_val)
        if not prefix and name in ("package", "versionName", "versionCode"):
            attrs.append((name, value))
        else:
            attrs.append((f"{prefix}{name}", value))
    return tag, attrs


def _format_attr_value(strings: list[str], raw_idx: int, data_type: int, data_val: int) -> str:
    if data_type == TYPE_STRING or raw_idx >= 0:
        s = _str(strings, raw_idx if raw_idx >= 0 else data_val)
        if s:
            return s
        if data_type == TYPE_STRING:
            return _str(strings, data_val)
    if data_type == TYPE_INT_BOOLEAN:
        return "true" if data_val != 0 else "false"
    if data_type == TYPE_INT_DEC:
        return str(data_val if data_val < 0x80000000 else data_val - 0x100000000)
    if data_type == TYPE_INT_HEX:
        return f"0x{data_val:x}"
    if data_type == TYPE_REFERENCE:
        return f"@{data_val:x}"
    if data_type == TYPE_NULL:
        return ""
    s = _str(strings, data_val)
    if s:
        return s
    return str(data_val)
