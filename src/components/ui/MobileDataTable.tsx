import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useMobileLayout } from '../../hooks/useMobileLayout';
import { ResponsiveTable } from './ResponsiveTable';
import './mobile-data-table.css';

type Props = React.TableHTMLAttributes<HTMLTableElement> & {
  summaryColumns?: number[];
  desktopResponsive?: boolean;
};
const elements = (children: React.ReactNode): React.ReactElement<any>[] => React.Children.toArray(children).flatMap(child =>
  !React.isValidElement<any>(child) ? [] : child.type === React.Fragment ? elements(child.props.children) : [child]);

/** Reuse the table's computed values and controls in compact, expandable mobile records. */
export function MobileDataTable({ children, summaryColumns = [0, 1], desktopResponsive = false, ...props }: Props) {
  const mobile = useMobileLayout();
  if (!mobile) return desktopResponsive ? <ResponsiveTable {...props}>{children}</ResponsiveTable> : <table {...props}>{children}</table>;
  const sections = elements(children);
  const headers = elements(elements(sections.find(s => s.type === 'thead')?.props.children)[0]?.props.children)
    .map(cell => cell.props.children ?? cell.props.label);
  const rows = elements(sections.find(s => s.type === 'tbody')?.props.children);
  const footer = elements(sections.find(s => s.type === 'tfoot')?.props.children);
  const content = (cell: React.ReactElement<any>) => <div className={`record-value ${cell.props.className || ''}`} style={cell.props.style}>{cell.props.children}</div>;
  return <div className="mobile-records" aria-label={props['aria-label'] || 'Records'}>
    {rows.map((row, index) => {
      const cells = elements(row.props.children);
      if (cells.length === 1 && cells[0].props.colSpan > 1) return <div key={row.key || index}>{cells[0].props.children}</div>;
      return <article key={row.key || index}>
        <div className="mobile-record-header">{summaryColumns.filter(i => cells[i]).map(i => <div key={i}><small>{headers[i]}</small>{content(cells[i])}</div>)}</div>
        <details className="clean-holding-details"><summary><span className="when-closed">See details</span><span className="when-open">Hide details</span><ChevronDown size={14}/></summary>
          <div className="clean-details-content"><dl>{cells.map((cell, i) => <div key={i}><dt>{headers[i]}</dt><dd>{content(cell)}</dd></div>)}</dl></div>
        </details>
      </article>;
    })}
    {footer.map((row, index) => {
      let column = 0;
      return <div className="record-footer clean-details-content" key={index}><dl>{elements(row.props.children).map((cell, i) => {
        const label = headers[column]; column += Number(cell.props.colSpan || 1);
        return <div key={i}>{cell.props.colSpan > 1 ? content(cell) : <><dt>{label}</dt><dd>{content(cell)}</dd></>}</div>;
      })}</dl></div>;
    })}
  </div>;
}
