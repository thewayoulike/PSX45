# Deepen Company Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Deepen Profiles → Stocks → Company Info with toolkit financials, dividend teaser, filings, and your-vs-company yield; prefer toolkit tables on Financials.

**Architecture:** Extend `/api/pypsx?mode=company` to return structured `statements` (annual/quarterly financials+ratios) and `reports` from `get_reports`. Client `CompanyInfoData` consumes them in Company Info (snapshot, dividend desk, trends, filings) and Financials (tables when present, scrape fallback).

**Tech Stack:** pypsx-toolkit, Vitest, React/TS (`TickerPerformanceList`, `financials.ts`, `api/pypsx_lib.py`)

**Spec:** Canvas prototype `company-info-deepen-prototype.canvas.tsx`

## Tasks

- [x] T1: TS helpers + tests for pipe-series → table rows, yield parse, equity snapshot
- [x] T2: Python `statements` + `reports` on `get_company_info`; skip duplicate Address
- [x] T3: Types + Company Info UI deepen
- [x] T4: Financials tab prefer `companyInfo.statements`
- [x] T5: Verify `npm test`
