import React, { useEffect, useState } from 'react';

export function useMarketPagination<T>(rows: T[], resetKey: string) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  useEffect(() => { setPage(1); }, [resetKey, pageSize]);
  useEffect(() => { setPage(previous => Math.min(previous, pageCount)); }, [pageCount]);
  return {
    page: currentPage, pageSize, pageCount, total: rows.length,
    rows: rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    setPage: (next: number) => setPage(Math.max(1, Math.min(next, pageCount))),
    setPageSize: (next: number) => { if ([25, 50, 100].includes(next)) setPageSize(next); },
  };
}

type Pagination = ReturnType<typeof useMarketPagination>;
export function MarketPagination({ pagination, label, position, onNavigate }: {
  pagination: Pagination;
  label: 'Stocks' | 'Funds' | 'Insider records' | 'Headlines';
  position: 'top' | 'bottom';
  onNavigate?: () => void;
}) {
  const { page, pageSize, pageCount, total, setPage, setPageSize } = pagination;
  const navigate = (next: number) => { setPage(next); onNavigate?.(); };
  const start = total ? (page - 1) * pageSize + 1 : 0;
  return <nav className="mk-pagination" aria-label={`${label} pagination ${position}`}>
    <span role="status">{start.toLocaleString()}–{Math.min(page * pageSize, total).toLocaleString()} of {total.toLocaleString()} {label.toLowerCase()}</span>
    <label>{label === 'Headlines' ? 'Headlines per page' : 'Rows per page'}<select aria-label={`${label} rows per page ${position}`} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); onNavigate?.(); }}>
      {[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
    </select></label>
    <div className="mk-page-controls">
      <button disabled={page === 1} onClick={() => navigate(1)} aria-label={`First ${label.toLowerCase()} page`}>First</button>
      <button disabled={page === 1} onClick={() => navigate(page - 1)} aria-label={`Previous ${label.toLowerCase()} page`}>Previous</button>
      <span>Page {page} of {pageCount}</span>
      <button disabled={page === pageCount} onClick={() => navigate(page + 1)} aria-label={`Next ${label.toLowerCase()} page`}>Next</button>
      <button disabled={page === pageCount} onClick={() => navigate(pageCount)} aria-label={`Last ${label.toLowerCase()} page`}>Last</button>
    </div>
  </nav>;
}
