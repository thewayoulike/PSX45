import React from 'react';

/** Keep the same data and controls in a desktop table and labeled phone rows. */
export function ResponsiveTable({ children, className = '', ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  const sections = React.Children.toArray(children);
  const head = sections.find(node => React.isValidElement(node) && node.type === 'thead') as React.ReactElement<any> | undefined;
  const headerRow = head && React.Children.toArray(head.props.children).find(React.isValidElement) as React.ReactElement<any> | undefined;
  const headers = headerRow ? React.Children.toArray(headerRow.props.children).filter(React.isValidElement).map((cell: React.ReactElement<any>) => cell.props.children) : [];
  return <table {...props} role="table" className={`responsive-profile-table ${className}`}>
    {sections.map(section => {
      if (!React.isValidElement<any>(section) || !['tbody', 'tfoot'].includes(String(section.type))) return section;
      return React.cloneElement(section, { role: 'rowgroup' }, React.Children.map(section.props.children, row => {
        if (!React.isValidElement<any>(row) || row.type !== 'tr') return row;
        let column = 0;
        return React.cloneElement(row, { role: 'row' }, React.Children.map(row.props.children, cell => {
          if (!React.isValidElement<any>(cell)) return cell;
          const span = Number(cell.props.colSpan || 1);
          const label = span === 1 ? headers[column] : null;
          column += span;
          return React.cloneElement(cell, { role: 'cell' }, <>
            {label && <span aria-hidden="true" className="profile-cell-label">{label}</span>}
            <div className="profile-cell-value">{cell.props.children}</div>
          </>);
        }));
      }));
    })}
  </table>;
}
