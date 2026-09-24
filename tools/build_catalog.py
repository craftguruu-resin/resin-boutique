#!/usr/bin/env python3
"""Catalog generator disabled.

Git contains catalog logic only. Products and categories are owned by PostgreSQL
and created/managed through the Vendor Panel. This script intentionally never
reads media/catalog and never writes product/category records to data.js.
"""
from pathlib import Path

def main():
    print("Catalog build skipped: product/category data is backend-owned.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
